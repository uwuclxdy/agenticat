# Cargo Workspaces, Resolver, and Features

Load when editing a `[workspace]` table, choosing a `resolver`, or designing `[features]`.
Dependency version syntax: `dependencies.md`. `.cargo/config.toml` keys: `config.md`.

> _Captured 2026-06-28 (Rust/Cargo stable), audited against the Rust/Cargo 1.99 docs. To update: re-fetch the source URL(s) below, then diff for changes._

Sources: [workspaces](https://doc.rust-lang.org/cargo/reference/workspaces.html) | [resolver](https://doc.rust-lang.org/cargo/reference/resolver.html) | [features](https://doc.rust-lang.org/cargo/reference/features.html)

## Workspaces

### `[workspace]` Table Fields

| Field | Type | Notes |
|---|---|---|
| `members` | `[String]` | Paths/globs to `Cargo.toml` dirs to include |
| `exclude` | `[String]` | Paths to exclude (useful to narrow globs) |
| `default-members` | `[String]` | Subset operated on at workspace root without `-p`; defaults to root pkg or all members if virtual |
| `resolver` | `"1"` / `"2"` / `"3"` | **Must be set explicitly in virtual manifests** (no `package.edition` to infer from) |
| `metadata` | table | Arbitrary tool data; ignored by Cargo, no warnings |

- Keep members in one flat directory (`crates/`), listed with a glob.
- A `path` dependency inside the workspace directory becomes a member automatically.

```toml
[workspace]
members = ["crates/*"]
exclude = ["crates/scratch"]
default-members = ["crates/cli"]
resolver = "3"   # edition 2024; "2" for edition 2021
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

`license-file` and `readme` paths are relative to the workspace root, not the member crate. Inherited `include` and `exclude` are relative to the member's package root.

```toml
# root Cargo.toml
[workspace.package]
version = "1.2.3"
edition = "2024"
rust-version = "1.85"
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
- A member entry with `{ workspace = true }` may add only `optional`, `features` and, in an edition 2024 package on Rust 1.99+, `default-features` (otherwise set it on the `[workspace.dependencies]` entry); any other key (`version`, `git`, `path`, `registry`) is ignored with a warning. See `references/dependencies.md` (Workspace Inheritance).

```toml
# root Cargo.toml
[workspace.dependencies]
serde = { version = "1", default-features = false, features = ["derive"] }
tokio = { version = "1", features = ["rt-multi-thread", "macros"] }
cc = "1.0"

# member Cargo.toml
[dependencies]
serde = { workspace = true, features = ["std"] }   # adds "std" on top of workspace features
# ignored: serde = { workspace = true, version = "1" }   (the version comes from the workspace)

[build-dependencies]
cc.workspace = true

[dev-dependencies]
tokio.workspace = true
```

> Centralizing versions in `[workspace.dependencies]` gives every member one requirement and one copy. Duplicate versions are semver-incompatible copies, often from open ranges like `>=0.6`: `cargo tree --duplicates`.

### `[workspace.lints]`: Shared Lint Config

Requires Rust 1.74+. `[workspace.lints]` is never inherited implicitly: every member needs its own `[lints] workspace = true`, or it silently keeps the default lint levels.

```toml
# root Cargo.toml
[workspace.lints.rust]
unsafe_code = "forbid"

[workspace.lints.clippy]
all = "warn"

# every member Cargo.toml (no [lints] table = the root lints never apply)
[lints]
workspace = true
```

### Virtual Manifests

A workspace root with no `[package]` table. Use when the repo has no single "main" crate.

```toml
# root Cargo.toml: virtual manifest
[workspace]
members = ["crates/*"]
resolver = "3"           # required: no edition to infer from (unset = resolver "1")
```

Behavior differences from root-package workspace:
- `cargo build` at root builds all members (not just root pkg)
- No `[lib]` / `[[bin]]` / `[dependencies]` in this file

### Shared Resources

| Resource | Behavior |
|---|---|
| `Cargo.lock` | Single file at workspace root, shared by all members |
| `target/` | Default shared output dir at workspace root; all members compile into it |
| `[patch]`, `[replace]`, `[profile.*]` | **Only** the root manifest is read; member-level entries are warned and ignored (Cargo prints e.g. `profiles for the non root package will be ignored`), not silently dropped. `[replace]` is deprecated: use `[patch]` |

> The shared `target/` reuses incremental compilation artifacts for all workspace crates. No redundant rebuilds when a shared dep changes.

## Resolver

### Versions at a Glance

| Version | Default for | MSRV | Key change |
|---|---|---|---|
| `"1"` | pre-2021 editions | any | Original; over-unifies features |
| `"2"` | edition 2021 | 1.51 | Separate feature sets for build-deps, dev-deps, target-specific deps |
| `"3"` | edition 2024 | 1.84 | Inherits v2 + prefers MSRV-compatible dep versions by default |

The resolver version is workspace-global. The value in a dependency's own `Cargo.toml` is ignored; only the top-level package/workspace value applies. A member's own `resolver` key is ignored (Cargo warns if it differs).

### Feature Unification: v1 vs v2

#### Resolver v1 (Over-Unification)

All features on any dependency, regardless of context (normal, build, dev, target-specific), are merged into one unified set. A feature set in `[build-dependencies]` bleeds into the normal lib build.

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

> Switching `resolver = "1"` to `"2"` keeps dev/test-only and build-script features out of production builds, but one dependency may now build several times with different feature sets: check `cargo tree --duplicates`. List every feature your code uses on your own dependency entry; a feature only another context enabled is no longer unified in.

#### Resolver v3 Additions

Inherits all v2 isolation behavior. Additional change: `resolver.incompatible-rust-versions` defaults to `fallback` instead of `allow`.

- `fallback`: prefers dep versions with `rust-version` ≤ your `rust-version` (unset: your toolchain's version)
- `allow`: picks newest compatible semver regardless of MSRV
- Declare the MSRV with `rust-version` instead of hand-pinning old versions

```toml
# .cargo/config.toml only (in Cargo.toml, resolver = "3" flips the default)
[resolver]
incompatible-rust-versions = "fallback"
```

### How `Cargo.lock` Is Generated

The resolver runs twice: first with all workspace features unioned (this writes `Cargo.lock`, so it lists optional deps you never activate), then with the features actually selected (this decides what compiles).

### Compile-Time + Correctness Impact Summary

| Issue | Root cause | Fix |
|---|---|---|
| Extra features in lib binary | resolver v1 build-dep bleed | `resolver = "2"` |
| Tests inflate lib features | resolver v1 dev-dep bleed | `resolver = "2"` |
| Wrong conditional compilation on non-host target | resolver v1 target unification | `resolver = "2"` |
| MSRV breaks from newest dep version | resolver v2 `allow` default | `resolver = "3"` or set `incompatible-rust-versions = "fallback"` |
| Type mismatch from duplicate crate versions | semver-incompatible versions in graph | unify via `[workspace.dependencies]` |
| Resolution error on a `-sys` crate | two versions declare the same `links` name | keep one version of that crate in the graph |

### Useful Diagnostic Commands

```bash
# why is this dep in the graph?
cargo tree --workspace --target all --all-features --invert rand

# what features are being activated and by what?
cargo tree --workspace --target all --all-features --edges features --invert rand

# duplicate crate versions
cargo tree --workspace --target all --all-features --duplicates

# resolver trace
CARGO_LOG=cargo::resolver=trace cargo update   # log targets can change between Cargo versions
```

## Features

### `[features]` Table

```toml
[features]
default = ["std"]          # auto-enabled; disable with --no-default-features
std = []
derive = ["dep:serde_derive"]
full = ["std", "derive"]   # feature dependencies
```

- Features are additive: enabling one never removes functionality, and any combination should be safe
- Name a feature after what it adds: `std`, never `use-std`, `with-std` or `no_std`
- Removing a feature, or dropping it from `default`, is usually SemVer-breaking, and the resolver keeps dependents that need it on old versions. Until the next major keep a no-op: `logging = []  # deprecated`
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
# wrong: "rgb/serde" (no `?`) also force-enables the optional rgb dependency
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
// fragment
// wrong: enabling `std` removes `my_fn`
#[cfg(not(feature = "std"))]
pub fn my_fn() {}

// correct: `#![no_std]` at the crate root; `std` only adds items
#[cfg(feature = "std")]
pub fn my_fn() {}
```

### Mutually Exclusive Features (Pitfall)

Avoid. Requires coordinating the entire dependency graph. If unavoidable:

```rust
#[cfg(all(feature = "foo", feature = "bar"))]
compile_error!("features \"foo\" and \"bar\" are mutually exclusive");
```

Better: split into separate crates, use runtime config, or use `cfg_select!` (Rust 1.95+; older: `cfg-if`) for precedence.

### Feature Unification in the Dependency Graph

When multiple packages depend on the same crate with different features, Cargo builds it once with the union of all requested features (resolver v2 scopes that unification per context, see above). A feature activated by package A does not activate it in package B's own code; it only changes how the shared dependency is built.

### CLI Flags

```bash
cargo build --features "foo,bar"          # activate specific features
cargo build --features "serde/derive"     # activate feature on specific dep
cargo build --all-features                # activate every feature
cargo build --no-default-features         # disable default feature
cargo build -p crate_a --features "feat" # feature of one workspace member (resolver "2"+)
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

Only `[[bin]]`, `[[bench]]`, `[[test]]` and `[[example]]` honor it; on `[lib]` it has no effect.

## Optimization Cheatsheet

| Goal | Action |
|---|---|
| Deduplicate dep versions in the workspace | align requirements in `[workspace.dependencies]`, then `cargo update -p <crate>@<old> --precise <version>` for what remains |
| Cut binary size / compile scope | `default-features = false` on heavy deps; activate only needed features. Another dependent that leaves defaults on re-enables them: check `cargo tree -e features -i <crate>` |

## Checklist

- [ ] `resolver` is set once, in `[workspace]` (`"3"` for edition 2024).
- [ ] Every member has `[lints] workspace = true`.
- [ ] `[profile.*]` and `[patch]` sit only in the root manifest; no `[replace]`.
- [ ] An inherited dependency adds only `optional`, `features` and (edition 2024 + Rust 1.99+) `default-features`.
- [ ] Optional dependencies go through `dep:`; their features through `?/`.
- [ ] No feature removes items; none is named `no_std`, `use-*` or `with-*`.
