# Cargo Workspaces, Resolver, and Features
> _Captured 2026-06-28 (Rust/Cargo stable). To update: re-fetch the source URL(s) below, then diff for changes._

Sources: [workspaces](https://doc.rust-lang.org/cargo/reference/workspaces.html) | [resolver](https://doc.rust-lang.org/cargo/reference/resolver.html) | [features](https://doc.rust-lang.org/cargo/reference/features.html)

---

## Workspaces

### `[workspace]` Table Fields

| Field | Type | Notes |
|---|---|---|
| `members` | `[String]` | Paths/globs to `Cargo.toml` dirs to include |
| `exclude` | `[String]` | Paths to exclude (useful to narrow globs) |
| `default-members` | `[String]` | Subset operated on at workspace root without `-p`; defaults to root pkg or all members if virtual |
| `resolver` | `"1"` / `"2"` / `"3"` | **Must be set explicitly in virtual manifests** (no `package.edition` to infer from) |
| `metadata` | table | Arbitrary tool data; ignored by Cargo, no warnings |

```toml
[workspace]
members = ["crates/*"]
exclude = ["crates/scratch"]
default-members = ["crates/cli"]
resolver = "2"
```

### `[workspace.package]`: Inheritable Package Fields

Requires Rust 1.64+. Members inherit with `field.workspace = true`.

| Inheritable Field |
|---|
| `version`, `authors`, `edition`, `rust-version` |
| `description`, `documentation`, `homepage`, `repository` |
| `license`, `license-file`, `readme` |
| `categories`, `keywords` |
| `publish`, `include`, `exclude` |

`license-file` and `readme` paths are relative to the workspace root, not the member crate.

```toml
# root Cargo.toml
[workspace.package]
version = "1.2.3"
edition = "2021"
rust-version = "1.70"
license = "MIT"

# member Cargo.toml
[package]
name = "my-crate"
version.workspace = true
edition.workspace = true
rust-version.workspace = true
license.workspace = true
```

### `[workspace.dependencies]`: Shared Dependencies

Requires Rust 1.64+.

- Cannot mark workspace deps as `optional`
- `features` declared here are additive with member-level features (member can add more, not subtract)
- Members choose dep kind (normal / build / dev) at the member level

```toml
# root Cargo.toml
[workspace.dependencies]
serde = { version = "1", default-features = false, features = ["derive"] }
tokio = { version = "1", features = ["rt-multi-thread", "macros"] }
cc = "1.0"

# member Cargo.toml
[dependencies]
serde = { workspace = true, features = ["std"] }   # adds "std" on top of workspace features

[build-dependencies]
cc.workspace = true

[dev-dependencies]
tokio.workspace = true
```

> Centralizing versions in `[workspace.dependencies]` pins all members to the same version, cutting duplicate compiles of the same crate at different semver-compatible versions. One of the biggest compile-time wins in a workspace.

### `[workspace.lints]`: Shared Lint Config

Requires Rust 1.74+.

```toml
# root Cargo.toml
[workspace.lints.rust]
unsafe_code = "forbid"

[workspace.lints.clippy]
all = "warn"

# member Cargo.toml
[lints]
workspace = true
```

### Virtual Manifests

A workspace root with no `[package]` table. Use when the repo has no single "main" crate.

```toml
# root Cargo.toml: virtual manifest
[workspace]
members = ["crates/*"]
resolver = "2"           # required: no edition to infer from
```

Behavior differences from root-package workspace:
- `cargo build` at root builds all members (not just root pkg)
- No `[lib]` / `[[bin]]` / `[dependencies]` in this file

### Shared Resources

| Resource | Behavior |
|---|---|
| `Cargo.lock` | Single file at workspace root, shared by all members |
| `target/` | Default shared output dir at workspace root; all members compile into it |
| `[patch]`, `[replace]`, `[profile.*]` | **Only** the root manifest is read; member-level entries are warned and ignored (Cargo prints e.g. `profiles for the non root package will be ignored`), not silently dropped |

> The shared `target/` reuses incremental compilation artifacts for all workspace crates. No redundant rebuilds when a shared dep changes.

---

## Resolver

### Versions at a Glance

| Version | Default for | MSRV | Key change |
|---|---|---|---|
| `"1"` | pre-2021 editions | any | Original; over-unifies features |
| `"2"` | edition 2021 | 1.51 | Separate feature sets for build-deps, dev-deps, target-specific deps |
| `"3"` | edition 2024 | 1.84 | Inherits v2 + prefers MSRV-compatible dep versions by default |

Set explicitly:

```toml
# single package
[package]
resolver = "2"

# virtual workspace (required field)
[workspace]
resolver = "2"
```

The resolver version is workspace-global. The value in a dependency's own `Cargo.toml` is ignored; only the top-level package/workspace value applies.

### Feature Unification: v1 vs v2

#### Resolver v1 (Over-Unification)

All features on any dependency, regardless of context (normal, build, dev, target-specific), are merged into one unified set. A feature set in `[build-dependencies]` bleeds into the normal lib build.

```toml
[dependencies]
log = "0.4"

[build-dependencies]
log = { version = "0.4", features = ["std"] }
# v1: log built with "std" for BOTH build script AND library
```

#### Resolver v2 (Isolated Feature Sets)

Three isolation scenarios:

| Scenario | v1 | v2 |
|---|---|---|
| Build-dep with extra features | Features bleed into lib | Features **isolated to build-dep** |
| Dev-dep with extra features | Features always active | Features only active during `cargo test` / `--all-targets` |
| Target-specific dep for untargeted arch | All target features unified | Features skipped when target not being built |

```toml
# v2 example: serde
[dependencies]
serde = { version = "1", default-features = false }

[dev-dependencies]
serde = { version = "1", features = ["std"] }
# v2: lib builds without "std"; tests build with "std"
# v1: lib always builds with "std"
```

```toml
# v2 example: target isolation
[target.'cfg(windows)'.dependencies.winapi]
version = "0.3"
features = ["fileapi"]
# v2: "fileapi" NOT compiled when building for Linux
# v1: "fileapi" compiled regardless of target
```

> Switching `resolver = "1"` to `"2"` is often the single biggest correctness and binary-size win. Dev/test-only features stop inflating production builds. Build-script features stop forcing heavier compilation in the library target.

#### Resolver v3 Additions

Inherits all v2 isolation behavior. Additional change: `resolver.incompatible-rust-versions` defaults to `fallback` instead of `allow`.

- `fallback`: prefers dep versions with `rust-version` ≤ your toolchain's version when possible
- `allow`: picks newest compatible semver regardless of MSRV

```toml
# .cargo/config.toml (or workspace Cargo.toml with v3)
[resolver]
incompatible-rust-versions = "fallback"
```

### How `Cargo.lock` Is Generated

The resolver runs twice:
1. First pass: all workspace features unioned; generates `Cargo.lock` with all optional deps present
2. Second pass: actual features from CLI/config; determines what gets compiled

This means `Cargo.lock` entries include optional deps even if you never activate them. The second pass prunes that list down to what compiles.

### Compile-Time + Correctness Impact Summary

| Issue | Root cause | Fix |
|---|---|---|
| Extra features in lib binary | resolver v1 build-dep bleed | `resolver = "2"` |
| Tests inflate lib features | resolver v1 dev-dep bleed | `resolver = "2"` |
| Wrong conditional compilation on non-host target | resolver v1 target unification | `resolver = "2"` |
| MSRV breaks from newest dep version | resolver v2 `allow` default | `resolver = "3"` or set `incompatible-rust-versions = "fallback"` |
| Type mismatch from duplicate crate versions | semver-incompatible versions in graph | unify via `[workspace.dependencies]` |

### Useful Diagnostic Commands

```bash
# why is this dep in the graph?
cargo tree --workspace --target all --all-features --invert rand

# what features are being activated and by what?
cargo tree --workspace --target all --all-features --edges features --invert rand

# duplicate crate versions
cargo tree --workspace --target all --all-features --duplicates

# resolver trace
CARGO_LOG=cargo::core::resolver=trace cargo update
```

---

## Features

### `[features]` Table

```toml
[features]
default = ["std"]          # auto-enabled; disable with --no-default-features
std = []
derive = ["dep:serde_derive"]
full = ["std", "derive"]   # feature dependencies
```

- Features are additive: enabling any combination must be safe
- Removing a feature or removing it from `default` is a SemVer-breaking change
- crates.io: ASCII alphanumeric, `_`, `-`, `+` only; max 300 features per crate

### Optional Dependencies -> Implicit Features

```toml
[dependencies]
gif = { version = "0.11", optional = true }
# implicitly creates: [features] gif = ["dep:gif"]
```

Activates `cfg(feature = "gif")` in code. Turned on via `--features gif`.

### `dep:<name>`: Suppress Implicit Feature

```toml
[dependencies]
ravif = { version = "0.6", optional = true }
rgb  = { version = "0.8", optional = true }

[features]
avif = ["dep:ravif", "dep:rgb"]
# "ravif" and "rgb" feature names are NOT created
# callers must use --features avif, not --features ravif
```

Required Rust 1.60+.

> Use `dep:` to prevent leaking internal optional dep names as public feature API. Cuts feature surface and prevents accidental activation.

### Weak Dependency Features (`?/`)

Activates a feature on a dep only if that dep is already pulled in:

```toml
[dependencies]
serde = { version = "1", optional = true }
rgb   = { version = "0.8", optional = true }

[features]
serde = ["dep:serde", "rgb?/serde"]
# rgb/serde is enabled only if rgb is independently activated
```

Required Rust 1.60+.

### Feature Dependencies

```toml
[features]
foo = []
bar = ["foo"]         # enabling bar also enables foo
baz = ["bar", "dep:somecrate", "othercrate/their-feature"]
```

`dep/feature` syntax activates `feature` on `dep` (dep does not need to be optional).

### Additive Principle

Features MUST NOT remove or disable behavior. Only add.

```rust
// wrong: hides function when std is absent
#[cfg(not(feature = "std"))]
pub fn my_fn() {}

// correct: exposes function only when std is present
#![no_std]
#[cfg(feature = "std")]
pub fn my_fn() {}
```

### Mutually Exclusive Features (Pitfall)

Avoid. Requires coordinating the entire dependency graph. If unavoidable:

```rust
#[cfg(all(feature = "foo", feature = "bar"))]
compile_error!("features \"foo\" and \"bar\" are mutually exclusive");
```

Better: split into separate crates, use runtime config, or use `cfg-if` for precedence.

### Feature Unification in the Dependency Graph

When multiple packages depend on the same crate with different features, Cargo builds it once with the
union of all requested features (resolver v2 scopes that unification per context, see above). A feature
activated by package A does not activate it in package B's own code; it only changes how the shared
dependency is built.

### CLI Flags

```bash
cargo build --features "foo,bar"          # activate specific features
cargo build --features "serde/derive"     # activate feature on specific dep
cargo build --all-features                # activate every feature
cargo build --no-default-features         # disable default feature
cargo build -p crate_a --features "feat" # target specific workspace member
```

> `--no-default-features` in CI lint/clippy checks the minimal feature set for feature-gating bugs. `--all-features` catches compilation errors in all code paths.

### Inspecting Features

```bash
cargo tree -e features                  # show feature edges
cargo tree -f "{p} {f}"                # compact: name + active features
cargo tree -e features -i serde        # invert: what activates serde's features?
```

### `required-features` on Targets

```toml
[[bin]]
name = "my-tool"
required-features = ["unstable"]
# bin is skipped if "unstable" not activated, instead of erroring
```

---

## Optimization Cheatsheet

| Goal | Action |
|---|---|
| Avoid test/dev features in production lib | `resolver = "2"` (or `"3"`) |
| Avoid build-script features in lib | `resolver = "2"` |
| Deduplicate dep versions in the workspace | `[workspace.dependencies]` with pinned version |
| Eliminate extra deps from optional code paths | `dep:<name>` + feature gates |
| Cut binary size / compile scope | `default-features = false` on heavy deps; activate only needed features |
| Diagnose why features are activated | `cargo tree -e features -i <crate>` |
| Diagnose duplicate crate versions | `cargo tree --duplicates` |
| Prefer MSRV-compatible dep versions | `resolver = "3"` or `incompatible-rust-versions = "fallback"` |
| Share incremental build artifacts | shared `target/` (automatic in workspaces) |
