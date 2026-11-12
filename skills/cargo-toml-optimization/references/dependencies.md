# Cargo Dependency Specification & Overriding

Load when writing or reviewing a dependency entry: version requirement, git/path/registry source, keys, `[target]` gating, `[patch]`.
Features and workspace layout: `workspaces.md`.

> _Captured 2026-06-28 (Rust/Cargo stable). To update: re-fetch the source URL(s) below, then diff for changes._

> Sources: https://doc.rust-lang.org/cargo/reference/specifying-dependencies.html, https://doc.rust-lang.org/cargo/reference/overriding-dependencies.html

## Version Requirement Syntax

Write a bare caret requirement naming the minimum version the code uses. Exact versions belong to `Cargo.lock`.

```toml
[dependencies]
log = "1.2.3"    # RIGHT: bare caret
# WRONG: log = "*" | log = ">=1.2" | log = "^1.2.3" | log = ">=1.2, <1.5"
```

### Caret `^` (Default; Bare Version = Caret)

Bare version = caret: SemVer-compatible updates, left-most non-zero component pinned (`1.2.3`/`^1.2.3` -> `>=1.2.3, <2.0.0`). The 0.x rows are the non-obvious ones:

| Spec | Resolves to |
|------|-------------|
| `0.2.3` | `>=0.2.3, <0.3.0` |
| `0.0.3` | `>=0.0.3, <0.0.4` |

### Tilde `~`

Patch-level only when minor is given (`~1.2` -> `>=1.2.0, <1.3.0`); `~1` -> `>=1.0.0, <2.0.0`. Tighter than caret; useful when a minor bump risks ABI/behavioral change.

### Wildcard `*`

`*` -> `>=0.0.0`; `1.*` -> `>=1.0.0, <2.0.0`; `1.2.*` -> `>=1.2.0, <1.3.0`.

**Warning**: crates.io rejects bare `*`, and it admits breaking releases. Never write it.

### Comparison Operators

`>= 1.2.0`, `> 1`, `< 2`, `= 1.2.3` (exact pin), `>= 1.2, < 1.5` (multiple requirements, comma-separated).

**Opt-lever**: `= x.y.z` hard-pins, guaranteeing reproducibility at the cost of no security patches. Reserve it for tightly coupled packages (a library and its proc-macro crate). Never cap a range (`>=1.2, <1.5`): the graph turns unresolvable when another crate needs newer.

### Pre-Releases

Excluded by default. Must be explicit: `"1.0.0-alpha"` (then alpha/beta/rc and final 1.x all match). Do not use pre-release versions in stable library crates.

## Dependency Sections

| Section | When pulled in | Propagated to dependents? | Notes |
|---------|---------------|--------------------------|-------|
| `[dependencies]` | always | yes | runtime deps |
| `[dev-dependencies]` | tests, examples, benches only | no | not shipped in library |
| `[build-dependencies]` | build script (`build.rs`) only | no | build script cannot read `[dependencies]` |

**Opt-lever**: `[dev-dependencies]` bloat never reaches downstream consumers. Still worth trimming if they slow local `cargo test` cold builds.

Target-gated variants: `[target.'cfg(...)'.dev-dependencies]` and `[target.'cfg(...)'.build-dependencies]` both work.

## Source Kinds

Default registry is crates.io: `serde = "1.0"` equals `serde = { version = "1.0" }`.

### Git

```toml
[dependencies]
regex = { git = "https://github.com/rust-lang/regex.git", tag = "1.10.3" }   # RIGHT: pinned
# other refs: rev = "0c0990399" (commit hash) | rev = "refs/pull/493/head" (PR ref) | branch = "next"
# WRONG: regex = { git = "https://github.com/rust-lang/regex.git" } (no ref: follows the default branch)
lib = { git = "ssh://git@github.com/acme/lib.git", rev = "4c59b70" }         # RIGHT: full `ssh://` URL
# WRONG: git = "git@github.com:acme/lib.git" (scp shorthand: Cargo rejects it)
```

Never put `git` and `path` on one dependency.

Can layer a `version` check: `{ git = "...", branch = "next", version = "1.10.3" }`. Cargo verifies the git dep satisfies the semver constraint; `version` never selects the commit.

**Opt-lever**: git deps are not cached on crates.io; they re-fetch on lock changes and cannot be audited with `cargo audit`. Avoid in published crates; crates.io rejects them (except dev-deps).

### Path

```toml
[dependencies]
hello_utils = { path = "hello_utils", version = "0.1.0" }  # version required when publishing
# WRONG in a crate that gets published: hello_utils = { path = "hello_utils" }
```

Path must point at the directory containing `Cargo.toml`: no search below it.

With `path` + `version`, `path` wins locally; when published, `version` is used from the registry. Standard pattern for workspace members that are published.

### Alternative Registries

`some-crate = { version = "1.0", registry = "my-registry" }`. Registry must be configured in `.cargo/config.toml`. crates.io rejects a package that depends on another registry.

## Dependency Keys

| Key | Type | Purpose | Opt-relevance |
|-----|------|---------|---------------|
| `optional` | bool | makes dep a feature gate; not compiled if feature is off | cuts compile time + binary size when feature off |
| `default-features` | bool | include crate's default feature set | **set `false` to trim transitive deps and compile time** |
| `features` | array | opt-in to specific features | additive with workspace definition |
| `package` | string | actual crate name on registry (alias it locally) | allows two versions of same crate in one `[dependencies]` |
| `public` | bool | re-exports this dep in public API (unstable: `-Zpublic-dependency`, Rust 1.83+; the `cargo-features` route is deprecated) | affects downstream visibility |
| `registry` / `git` / `branch` / `tag` / `rev` / `path` | string | source location: alternative registry name, repo URL, git ref, local path | |

**`default-features = false` is the single highest-impact key for cutting compile time and binary size.** Always audit what a crate's defaults pull in. It is no guarantee: another requirer that leaves the defaults on re-enables them (check: `cargo tree -e features -i <crate>`).

## Target-Specific Dependencies

```toml
[target.'cfg(any(windows, target_os = "macos"))'.dependencies]
foo = "1.0"

[target.x86_64-pc-windows-gnu.dependencies]   # full triple
winhttp = "0.4.0"
```

Supports `not`, `any`, `all` cfg operators. Custom targets (nightly only): use base filename of the `.json` spec.

`cfg(feature = …)`, `cfg(test)`, `cfg(debug_assertions)` and `cfg(proc_macro)` do not work in a `[target]` table: gate on a Cargo feature with an `optional` dependency and `[features]`.

**Opt-lever**: target-gating deps avoids compiling OS-specific or arch-specific code on irrelevant targets. Critical for cross-compilation build times.

## Workspace Inheritance

A member pulls a shared dep with `{ workspace = true }` from `[workspace.dependencies]`. It may add `optional` and extra `features` (additive; cannot remove workspace-level features); on edition 2024 with Rust 1.99+ it may also override `default-features` (older edition or toolchain: set it on the workspace entry). No other key (`version`, `git`, `path`, `registry`) may be set. A `[workspace.dependencies]` entry can never be `optional`. Centralizes version pins and `default-features = false`, preventing multi-version bloat across members.

Worked example + `[workspace.package]` field inheritance: `workspaces.md`.

## Dependency Renaming (`package` Key)

`bar = { version = "0.1", package = "foo" }` imports package `foo` under the name `bar`. Allows linking two incompatible major versions simultaneously. Feature refs use the alias:

```toml
[dependencies]
bar = { version = "0.1", package = "foo", optional = true }

[features]
log-debug = ["bar/log-debug"]   # NOT foo/log-debug
```

## Overriding Dependencies

### `[patch]` (Recommended)

Overrides a source (registry or git URL) with a local path or different git ref. Applied transitively.

```toml
[patch.crates-io]
uuid = { path = "../uuid" }
serde = { git = "https://github.com/serde-rs/serde.git", rev = "4c59b70" }
# Patch multiple versions of same crate
serde2 = { git = "https://github.com/example/serde.git", package = "serde", branch = "v2" }

# Override non-crates-io source
[patch."https://github.com/your/repository"]
my-library = { path = "../my-library" }
```

**Rules:**
- Only valid at workspace root; ignored in member `Cargo.toml` files.
- Version numbers still matter. Cargo uses greedy resolution (maximum matching version).
- Can be set in `.cargo/config.toml` or via `--config` CLI flag.

**Opt-lever**: `[patch]` dedupes only when the patched version still satisfies every requirer's range. A requirer on another incompatible range keeps its own copy; update that requirer or accept the duplicate. Patch not picked up: `cargo update <crate> --precise <version>`. Hot-swapping a dep for a local fork during profiling/debugging works here too, without touching `[dependencies]`.

### `[replace]` (Deprecated)

`[replace]` entries look like `"foo:0.1.0" = { git = "…" }`. Requires exact `name:version`, cannot specify features. Use `[patch]` instead.

### `paths` Override (`.cargo/config.toml`)

`paths = ["/absolute/path/to/uuid"]`: quick local override without touching `Cargo.toml`. Restrictions: cannot add new dependencies or change graph structure; only works for crates-io crates; cannot be used for unpublished local crates; temporary / per-developer, not committed workflow.

## Checklist

Run over your own diff:

- [ ] Version requirements are bare carets: no `*`, `>=`, `^` or capped range; `=` only for coupled crates.
- [ ] Every git dependency has a ref; SSH URLs start with `ssh://`.
- [ ] In a published crate every `path`/`git` dependency also has `version`.
- [ ] No `cfg(feature = …)` in a `[target]` table.
- [ ] A `{ workspace = true }` entry adds only `optional`, `features`, (2024, 1.99+) `default-features`.
- [ ] `[patch]` is in the workspace root; no `[replace]`.
