---
name: cargo-toml-optimization
description: "Tune a Rust `Cargo.toml` or `.cargo/config.toml`: profiles, features, workspaces, dependency hygiene. Use when cutting compile time or binary size, trimming deps, or configuring a workspace. Not for writing Rust code (`clean-rust`)."
metadata:
  author: uwuclxdy
  version: "1.3"
---

# Cargo.toml Optimization

Tune a Rust manifest (`Cargo.toml`) and its build config (`.cargo/config.toml`) toward one goal at a
time. Runtime speed, binary size, compile time, dependency hygiene: these pull against each other, so
name the target before editing. Then take a baseline measurement, change a single lever, re-measure.

## Measure First

Advice you haven't measured is guessing. opt-level `"z"` is not always smaller than `"s"` or `3`. Fat
LTO can cost minutes of link time for a percent of runtime. The real bottleneck is often one crate on
the critical path rather than the whole graph.

| Question | Command |
|---|---|
| What is slow to compile? | `cargo build --timings` -> HTML report; read the critical path |
| Which deps are duplicated at incompatible versions? | `cargo tree -d` |
| What makes the binary big? | `cargo bloat --release --crates` (install `cargo-bloat`) |
| Why is this feature / crate here? | `cargo tree -e features -i <crate>` |

Build cache, `Cargo.lock` rules, `build.rs` cost: `references/how-cargo-works.md`.

## Two Files, Two Jobs

- **`Cargo.toml`** lists what to build: dependencies, features, profile definitions, workspace layout.
- **`.cargo/config.toml`** governs how it gets built: linker, `rustflags`, `sccache`, target, env. It can
  override any profile field; that override then wins over the `Cargo.toml` profile.

Trap: `[profile.*]` and `[patch]` are read **only from the workspace root**; the same tables in a member
crate are ignored with a warning, not applied. (`[workspace]` in a member is different: it makes that
crate its own workspace root.)

## Profiles: The Core of It

Most `Cargo.toml` tuning happens here. A profile applies to every target (lib, bin, test, bench).
Per-setting detail (every value, every default) is in `references/profiles.md`. Start from one of these:

**Balanced release** (near-fat-LTO quality, ~2x faster link than full fat LTO):

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
strip = "symbols"
```

**Min binary size** (benchmark `"z"` vs `"s"` vs `3`; size is workload-dependent):

```toml
[profile.release]
opt-level = "z"
lto = "fat"
codegen-units = 1
panic = "abort"
strip = "symbols"
```

**Fast iteration** (keep dev unoptimized, give deps light passes so generics aren't dog-slow):

```toml
[profile.dev]
opt-level = 0
debug = 1                # line tables only: faster, still usable backtraces
incremental = true

[profile.dev.package."*"]
opt-level = 1            # deps get basic opt; your crate stays fast to recompile

[profile.dev.build-override]
opt-level = 3            # build scripts + proc macros run fast (they compile slower)
```

To raise opt-level on a single hot dependency without touching the rest: `[profile.<name>.package.<crate>]`.

## Dependencies + Features

Detail in `references/dependencies.md`, `references/workspaces.md`. Highest-value moves:

- `default-features = false` on heavy deps, then add back only the features you use. Single biggest key
  for cutting compile time plus binary size. Audit what a crate's defaults pull in with `cargo tree -e features`.
- `resolver = "2"` (edition 2021+) or `"3"` (edition 2024+). Stops dev-only, build-script, or
  off-target features from inflating the production build. Often the biggest correctness + size win.
  In a virtual workspace it must be set explicitly under `[workspace]`.
- `[workspace.dependencies]` pins one version of each shared crate for every member. Duplicate compiles
  of the same crate at different semver-compatible versions go away.
- `dep:<name>` and `crate?/feature` (weak) to keep optional deps from leaking as public feature API.
- `[target.'cfg(...)'.dependencies]` so OS/arch-specific crates don't compile on irrelevant targets.

## Build Speed (`.cargo/config.toml`)

Detail in `references/config.md`. The levers that move the needle:

```toml
# faster linking: the single biggest incremental-build win on Linux
[target.x86_64-unknown-linux-gnu]
linker = "clang"
rustflags = ["-C", "link-arg=-fuse-ld=mold"]   # or rust-lld; mold is Linux-only

[build]
rustc-wrapper = "sccache"   # cache compiled artifacts across builds + CI runs (cargo install sccache)
```

`target-cpu=native` (via `rustflags`) squeezes out runtime speed but produces a **non-portable** binary.
Never ship it from CI or to other machines.

## Trim Dead Weight

Unused or duplicate deps, plus license/security audits, with the tools to find them: `references/dep-hygiene.md`. Quick hits:
`cargo tree -d` (duplicates), `cargo machete` (unused), `cargo deny check` (audit + version bans).

## Routing

The references embed the actual data (all 104 crates.io category slugs, SPDX identifiers, cfg/target
values, every rustc `-C` flag), so the skill answers without a web lookup. The doc links are only a
fallback if upstream changes. Read the one reference matching the task:

| Task | Reference |
|---|---|
| `[package]` fields, target tables, `crate-type`, publish-size trimming (`include`/`exclude`) | `references/manifest.md` |
| Full crates.io category slug list (104 slugs), keyword/badge rules, publish requirements | `references/crates-io-metadata.md` |
| `license` / `license-file`: SPDX expression grammar, common identifiers, the `MIT OR Apache-2.0` convention | `references/licenses.md` |
| Version syntax, sources (git/path/registry), `[patch]` dedupe, `default-features`, renaming | `references/dependencies.md` |
| `cfg(...)` values (`target_os`/`target_arch`/`target_env`/`target_feature`…) + common target triples for `[target.*]` gating | `references/cfg-targets.md` |
| Every `[profile.*]` setting + the full speed / size / iteration cheat-sheets | `references/profiles.md` |
| rustc `-C` codegen flags behind profiles + `rustflags` (`target-cpu`, `target-feature`, PGO, link args) | `references/rustc-flags.md` |
| `.cargo/config.toml`: linker, `rustflags`, sccache, `target-cpu`, registries, vendoring, aliases, env | `references/config.md` |
| Workspaces + inheritance, resolver v1/v2/v3, feature unification + `dep:`/weak features | `references/workspaces.md` |
| Unused / duplicate / heavy dep trimming (cargo-machete, cargo-udeps, cargo-deny) | `references/dep-hygiene.md` |
| How cargo builds, `Cargo.lock` vs `Cargo.toml`, build cache, `build.rs`, editions, diagnostics | `references/how-cargo-works.md` |

## Pitfalls to Check Before Declaring Victory

- `target-cpu=native`: non-portable, keep out of shipped artifacts.
- Features must be additive; removing one or dropping it from `default` is a SemVer break.
- Missing `cargo::rerun-if-changed` in `build.rs`: re-runs every build, common slow-rebuild cause.
- Two semver-incompatible versions of one crate bloat everything; `cargo tree -d` finds them, `[patch]` or `[workspace.dependencies]` collapses them.
- `panic = "abort"` breaks code relying on unwinding (`catch_unwind`, some test setups).
- `[paths]` override (`.cargo/config.toml`) only works for crates already on crates.io; it cannot add a new dependency, change graph structure, or point at an unpublished internal crate. Use a normal `path = "..."` dependency in `Cargo.toml` or `[patch]` instead.
- `{ workspace = true }` dependency inheritance: a member can only add `optional`/extra `features`; it cannot override the workspace entry's `version`, `default-features`, `git`, `path`, or `registry`.

## Official Docs

Canonical entry points (each reference file links its exact pages inline):

- Manifest: <https://doc.rust-lang.org/cargo/reference/manifest.html>
- Specifying dependencies: <https://doc.rust-lang.org/cargo/reference/specifying-dependencies.html>
- Profiles: <https://doc.rust-lang.org/cargo/reference/profiles.html>
- Configuration: <https://doc.rust-lang.org/cargo/reference/config.html>
- Workspaces: <https://doc.rust-lang.org/cargo/reference/workspaces.html>
- Resolver: <https://doc.rust-lang.org/cargo/reference/resolver.html>
- Features: <https://doc.rust-lang.org/cargo/reference/features.html>
- Cargo Book: <https://doc.rust-lang.org/cargo/>

## Maintenance

Reference data is captured against Rust/Cargo stable (edition 2024 / resolver v3 era). Every
`references/*.md` carries its own capture date at the top, next to the upstream URL it came from; dates
differ per file as they get refreshed. To refresh one file: re-fetch its source link, diff, update the
file, bump its date.
