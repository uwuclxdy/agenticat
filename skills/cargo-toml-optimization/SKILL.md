---
name: cargo-toml-optimization
description: "Tunes Rust `Cargo.toml` and `.cargo/config.toml`: profiles, features, workspaces, dependency hygiene."
when_to_use: "Use when cutting compile time or binary size, or trimming dependencies."
metadata:
  author: uwuclxdy
  version: "1.9"
---

# Cargo.toml Optimization

Tune a Rust manifest (`Cargo.toml`) and its build config (`.cargo/config.toml`) toward one goal at a time. Runtime speed, binary size, compile time, dependency hygiene: these pull against each other, so name the target before editing. Then take a baseline measurement, change a single lever, re-measure.

## Measure First

Advice you haven't measured is guessing. opt-level `"z"` is not always smaller than `"s"` or `3`. Fat LTO can cost minutes of link time for a percent of runtime. The real bottleneck is often one crate on the critical path rather than the whole graph.

| Question | Command |
|---|---|
| What is slow to compile? | `cargo build --timings` -> HTML report; read the critical path |
| Which deps are duplicated at incompatible versions? | `cargo tree -d` |
| What makes the binary big? | `cargo bloat --release --crates` (install `cargo-bloat`) |
| Why is this feature / crate here? | `cargo tree -e features -i <crate>` |

Build cache, `Cargo.lock` rules, `build.rs` cost: `references/how-cargo-works.md`.

## Two Files, Two Jobs

- **`Cargo.toml`** lists what to build: dependencies, features, profile definitions, workspace layout.
- **`.cargo/config.toml`** governs how it gets built: linker, `rustflags`, `sccache`, target, env. It can override any profile field; that override then wins over the `Cargo.toml` profile. So does a `CARGO_PROFILE_<NAME>_<KEY>` env var.

Trap: `[profile.*]`, `[patch]` and `resolver` are read **only from the workspace root**; in a member they are ignored with a warning (`resolver`: if it differs). (`[workspace]` in a member is different: it makes that crate its own workspace root.)

## Profiles: The Core of It

Most `Cargo.toml` tuning happens here. A profile applies to every target (lib, bin, test, bench). Per-setting detail (every value, every default) is in `references/profiles.md`. Start from one of these:

**Balanced release** (near-fat-LTO quality, substantially faster link than full fat LTO):

```toml
[profile.release]
opt-level = 3
lto = "thin"
codegen-units = 4
panic = "abort"          # smaller + faster panic path; drop it if you need unwinding or catch_unwind
strip = "debuginfo"      # trims size, keeps symbol names for crash reports
```

**Max runtime speed** (slow build, single-threaded codegen):

```toml
[profile.release]
opt-level = 3
lto = "fat"
codegen-units = 1
panic = "abort"
strip = "symbols"        # unreadable backtraces; use "debuginfo" if anything reports crashes
```

**Min binary size** (benchmark `"s"` vs `"z"` vs `3`; size is workload-dependent):

```toml
[profile.release]
opt-level = "s"          # then try "z": often larger than "s"
lto = "fat"
codegen-units = 1
panic = "abort"
strip = "symbols"        # unreadable backtraces; "debuginfo" keeps symbol names
```

**Fast iteration** (keep dev unoptimized, give deps light passes so generics aren't dog-slow):

```toml
[profile.dev]
opt-level = 0
debug = "line-tables-only"   # Rust 1.71+: faster, still usable backtraces; never `debug = 0`
incremental = true

[profile.dev.package."*"]
opt-level = 1            # deps get basic opt; your crate stays fast to recompile
debug = false            # no debuginfo for deps

[profile.dev.build-override]
opt-level = 3            # build scripts + proc macros run fast (they compile slower)
```

To raise opt-level on a single hot dependency without touching the rest: `[profile.<name>.package.<crate>]`. Generic code is instantiated in the calling crate, so this may do nothing for a generic-heavy dependency.

Several build modes: a custom `[profile.<name>]` with a required `inherits = "release"` (or `"dev"`), built by `cargo build --profile <name>`.

## Dependencies + Features

Detail in `references/dependencies.md`, `references/workspaces.md`. Highest-value moves:

- `default-features = false` on heavy deps, then add back only the features you use. Single biggest key for cutting compile time plus binary size. Audit what a crate's defaults pull in with `cargo tree -e features`. Any other requirer that leaves the defaults on re-enables them for the whole graph.
- `resolver = "2"` (edition 2021 default; set it on 2015/2018 too) or `"3"` (2024 default, Rust 1.84+). Stops dev-only, build-script, or off-target features from inflating the production build. Often the biggest correctness + size win. In a virtual workspace it must be set explicitly under `[workspace]`.
- `[workspace.dependencies]` sets one version requirement per shared crate for every member that inherits it with `{ workspace = true }`. Members stay aligned; a third-party crate's incompatible requirement still adds a second copy.
- `dep:<name>` and `crate?/feature` (weak) to keep optional deps from leaking as public feature API.
- `[target.'cfg(...)'.dependencies]` so OS/arch-specific crates don't compile on irrelevant targets.

## Build Speed (`.cargo/config.toml`)

Detail in `references/config.md`. The levers that move the needle:

```toml
# faster linking: lld is the x86_64 Linux default since Rust 1.90; mold is often faster still
[target.x86_64-unknown-linux-gnu]
linker = "clang"
rustflags = ["-C", "link-arg=-fuse-ld=mold"]   # mold is Linux-only

[build]
rustc-wrapper = "sccache"   # cache compiled artifacts across builds + CI runs (cargo install sccache)
```

`target-cpu=native` (via `rustflags`) squeezes out runtime speed but produces a **non-portable** binary. Never ship it from CI or to other machines.

## Trim Dead Weight

Unused or duplicate deps, plus license/security audits, with the tools to find them: `references/dep-hygiene.md`. Quick hits: `cargo tree -d` (duplicates), `cargo machete` (unused), `cargo deny check` (audit + version bans).

## Routing

The references embed the actual data (all 104 crates.io category slugs, SPDX identifiers, cfg/target values, every rustc `-C` flag), so the skill answers without a web lookup. Read the one reference matching the task:

| Task | Reference |
|---|---|
| `[package]` fields, target tables, `crate-type`, publish-size trimming (`include`/`exclude`) | `references/manifest.md` |
| Full crates.io category slug list (104 slugs), keyword/badge rules, publish requirements, published-crate deps, yank | `references/crates-io-metadata.md` |
| `license` / `license-file`: SPDX expression grammar, common identifiers, the `MIT OR Apache-2.0` convention | `references/licenses.md` |
| Version syntax, sources (git/path/registry), `[patch]` overrides, `default-features`, renaming | `references/dependencies.md` |
| `cfg(...)` values (`target_os`/`target_arch`/`target_env`/`target_feature`…) + common target triples for `[target.*]` gating, custom cfg declaration | `references/cfg-targets.md` |
| Every `[profile.*]` setting, default, override rule + the fast-iteration cheat-sheet | `references/profiles.md` |
| rustc `-C` codegen flags behind profiles + `rustflags` (`target-cpu`, `target-feature`, PGO, link args) | `references/rustc-flags.md` |
| `.cargo/config.toml`: linker, `rustflags`, sccache, `target-cpu`, registries + tokens, vendoring, aliases, env, `build.warnings` CI gate | `references/config.md` |
| Workspaces + inheritance, resolver v1/v2/v3, feature unification + `dep:`/weak features | `references/workspaces.md` |
| Unused / duplicate / heavy dep trimming (cargo-machete, cargo-udeps, cargo-deny) | `references/dep-hygiene.md` |
| How cargo builds, `Cargo.lock` vs `Cargo.toml`, `--locked`, build cache, `build.rs`, editions, diagnostics | `references/how-cargo-works.md` |

## Pitfalls to Check Before Declaring Victory

- Features must be additive; removing one or dropping it from `default` is a SemVer break.
- Missing `cargo::rerun-if-changed` in `build.rs`: the script re-runs whenever any file in the package changes, common slow-rebuild cause.
- Two semver-incompatible versions of one crate bloat everything; `cargo tree -d` finds them. Collapse them by moving the requirer of the older version onto the newer one. `[patch]` only swaps a source, `[workspace.dependencies]` only aligns inheriting members: neither unifies incompatible versions.
- `panic = "abort"` breaks code relying on unwinding (`catch_unwind`, cleanup in `Drop`). Tests, benches, build scripts and proc macros ignore the setting. If any crate in the graph is built with `abort`, the final binary must be too.
- `lto = false` is not "off": it still runs thin-local LTO. `lto = "off"` disables LTO.
- `[paths]` override (`.cargo/config.toml`) only works for crates already on crates.io; it cannot add a new dependency, change graph structure, or point at an unpublished internal crate. Use a normal `path = "..."` dependency in `Cargo.toml` or `[patch]` instead.
- `{ workspace = true }` dependency inheritance: a member can only add `optional`, extra `features`, and (edition 2024 on Rust 1.99+) its own `default-features`; it cannot override the workspace entry's `version`, `git`, `path`, or `registry`. Older edition or toolchain: set `default-features` on the workspace entry.
- Fix on sight: no `edition` key (compiles as 2015), `"*"` or `">=…"` versions, a git dependency with no `rev`, `tag` or `branch` (`references/manifest.md`, `references/dependencies.md`).

## Official Docs

Entry point: the Cargo Book, <https://doc.rust-lang.org/cargo/>.

## Maintenance

Reference data is captured against Rust/Cargo stable (edition 2024 / resolver v3 era) and audited against the Rust/Cargo 1.99 docs. Every `references/*.md` carries its own capture date at the top, next to the upstream URL it came from. To refresh one file: re-fetch its source link, diff, update the file, bump its date.
