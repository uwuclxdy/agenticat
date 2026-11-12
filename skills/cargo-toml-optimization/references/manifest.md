# Cargo.toml Manifest & Targets Reference

Load when writing or reviewing `[package]` fields, a target table (`[lib]`, `[[bin]]`, `[[bench]]`…), `crate-type`, or what `cargo publish` ships.
Dependency syntax: `dependencies.md`. Profiles: `profiles.md`.

> _Captured 2026-06-28 (Rust/Cargo stable). To update: re-fetch the source URL(s) below, then diff for changes._

> Sources: https://doc.rust-lang.org/cargo/reference/manifest.html, https://doc.rust-lang.org/cargo/reference/cargo-targets.html

## Forms to Get Right

```toml
[package]
name = "foo-sys"
version = "0.1.0"
edition = "2024"         # always set it: a manifest without `edition` compiles as 2015
rust-version = "1.85"    # bare version only: no `>=`, no `-nightly`
links = "foo"            # needs a `build.rs`; one package per `links` value in the whole graph
publish = false          # private package: blocks `cargo publish`

[lints]
workspace = true         # in every member: `[workspace.lints]` is never inherited implicitly (Rust 1.74+)
```

- Edition 2024 rejects the old aliases. Write `[package]`, `[dev-dependencies]`, `[build-dependencies]`, `default-features`, `crate-type`, `proc-macro`; never `[project]`, `[dev_dependencies]`, `default_features`.
- Do not write `authors`, `[badges]` or a per-target `edition`: all deprecated or unused.

## `[package]` Fields

> Fields marked **OPT** affect artifact type, compile time, or publish output. Fields marked **PUB** affect publishing behavior.

| Field | Purpose | Default | Type | OPT | PUB | Notes |
|-------|---------|---------|------|-----|-----|-------|
| `name` | Package identifier; used for default target names | required | String (alphanumeric, `-`, `_`) | | PUB | Max 64 chars on crates.io; ASCII only; first character a letter; no reserved/Windows names |
| `version` | SemVer package version | required for publishing | `MAJOR.MINOR.PATCH[-pre][+meta]` | | PUB | Examples: `1.0.0`, `1.0.0-alpha.1`, `1.0.0+21AF26D3` |
| `edition` | Rust edition for all targets | `2015` | `"2015"` \| `"2018"` \| `"2021"` \| `"2024"` | OPT | | Set by `cargo new`; controls language semantics for all targets |
| `rust-version` | Minimum supported Rust version (MSRV) | none | Bare version (`"1.85"`) | OPT | PUB | Enforces floor on toolchain; affects resolver behavior; no operators, no pre-release tag; [ref](https://doc.rust-lang.org/cargo/reference/rust-version.html) |
| `authors` | Package authors/orgs | none | `["Name <email>"]` | | PUB | **Deprecated** |
| `description` | Short plain-text summary | none | String | | PUB | Required by crates.io; not Markdown; shown on registry page |
| `documentation` | URL to hosted docs | none | URL | | PUB | Defaults to auto-linked docs.rs if omitted |
| `readme` | Path to README | auto-detected (`README.md`, `README.txt`, `README`) | File path \| `true` \| `false` | | PUB | `false` suppresses auto-detection |
| `homepage` | Project home page URL | none | URL | | PUB | Only for a dedicated site; don't duplicate `repository` or `documentation` |
| `repository` | Source repo URL | none | URL | | PUB | Git repository link |
| `license` | SPDX 2.3 license expression | none | String | | PUB | e.g., `MIT OR Apache-2.0`; required by crates.io when `license-file` is absent |
| `license-file` | Path to license text | none | File path | | PUB | Alternative to `license`; crates.io requires one or the other |
| `keywords` | Search terms | none | `["word", ...]` | | PUB | Max 5; max 20 chars each; alphanumeric start; ASCII only |
| `categories` | Registry categories | none | `["slug", ...]` | | PUB | Max 5; must match [crates.io/category_slugs](https://crates.io/category_slugs) exactly |
| `workspace` | Workspace root path | auto-inferred | Path string | | | Cannot coexist with `[workspace]` table in same manifest |
| `build` | Build script path | `build.rs` (auto-detected) | File path \| `false` | OPT | | Set `false` to explicitly disable build script; [ref](https://doc.rust-lang.org/cargo/reference/build-scripts.html) |
| `links` | Native library name | none | String | OPT | | e.g., `links = "git2"` for libgit2; prevents duplicate native linking; requires a build script; [ref](https://doc.rust-lang.org/cargo/reference/build-scripts.html#the-links-manifest-key) |
| `exclude` | Files excluded from published package | none | `["glob", ...]` | OPT | PUB | gitignore-style patterns; mutually exclusive with `include`; reduces publish size |
| `include` | Files explicitly included in published package | none | `["glob", ...]` | OPT | PUB | Overrides `exclude`; use `!pattern` for negation; best for minimizing publish size |
| `publish` | Publishing restrictions | none | `false` \| `["registry"]` | | PUB | `false` blocks all publishing (so does omitting `version`); single registry becomes default for `cargo publish` |
| `metadata` | External tool configuration | none | TOML table | | | Cargo ignores; consumed by external tools (e.g., `[package.metadata.android]`) |
| `default-run` | Default binary for `cargo run` | none | Binary name string | | | Required when multiple `[[bin]]` targets exist and you want a default |
| `autolib` | Auto-discover `src/lib.rs` as `[lib]` | `true` | Bool | OPT | | `false` disables; Rust 1.83+ |
| `autobins` | Auto-discover `src/main.rs` / `src/bin/*.rs` | `true` | Bool | OPT | | `false` disables; Rust 1.27+ |
| `autoexamples` | Auto-discover `examples/*.rs` | `true` | Bool | OPT | | `false` disables; Rust 1.27+ |
| `autotests` | Auto-discover `tests/*.rs` | `true` | Bool | OPT | | `false` disables; Rust 1.27+ |
| `autobenches` | Auto-discover `benches/*.rs` | `true` | Bool | OPT | | `false` disables; Rust 1.27+ |
| `resolver` | Dependency resolver version | inferred from edition/workspace | `"1"` \| `"2"` \| `"3"` | OPT | | **Critical**: v2 gives proper feature unification; v3 (Rust 1.84+) makes MSRV-aware version selection the default; edition 2021 defaults to v2, 2024 to v3; workspace-global: a member's or dependency's value is ignored, a virtual workspace sets it under `[workspace]`; [ref](https://doc.rust-lang.org/cargo/reference/resolver.html#resolver-versions) |

## Include/Exclude Pattern Syntax

Patterns follow gitignore-style globbing. Cargo-specific behavior on top of that: sub-packages (dirs holding their own `Cargo.toml`) and `target/` are auto-excluded no matter what; `Cargo.toml`, a minimized `Cargo.lock` and the `license-file` target stay included regardless. Hidden dot-files outside git and git-ignored files are skipped only when `include` is not set: an `include` list turns gitignore filtering off, so it must name every file to ship. In an `include` list, `!pattern` negates (re-excludes) an earlier match.

Verify the result with `cargo package --list`.

## Target Tables

### `[lib]` Fields

Single table only.

| Field | Purpose | Default | OPT | Notes |
|-------|---------|---------|-----|-------|
| `name` | Crate name used by dependents | Package name, dashes become `_` | | |
| `path` | Source file path | `src/lib.rs` | | |
| `test` | Include in `cargo test` | `true` | OPT | |
| `doctest` | Run doc-comment tests via rustdoc | `true` | OPT | Only applies to `[lib]` |
| `bench` | Include in `cargo bench` | `true` | OPT | |
| `doc` | Include in `cargo doc` | `true` | OPT | |
| `proc-macro` | Mark as procedural macro | `false` | OPT | Automatically sets `crate-type = ["proc-macro"]` |
| `harness` | libtest test runner on/off | `true` | OPT | `false` disables the built-in libtest runner; requires a custom `main()` |
| `crate-type` | Output artifact type(s) | `["lib"]` | OPT | **Controls artifact type and link behavior.** See table below |
| `edition` | Rust edition override | Inherits `[package].edition` | | Deprecated; avoid per-target override |

### `[[bin]]` Fields

Repeatable.

| Field | Purpose | Default | OPT | Notes |
|-------|---------|---------|-----|-------|
| `name` | Binary name and output filename | required | | |
| `path` | Source file | `src/main.rs` (single bin) or `src/bin/<name>.rs` | | |
| `test` | Include in `cargo test` | `true` | OPT | |
| `bench` | Include in `cargo bench` | `true` | OPT | |
| `doc` | Include in `cargo doc` | `true` | OPT | Skipped if name matches lib target |
| `harness` | libtest test runner on/off | `true` | OPT | |
| `required-features` | Features needed to build this target | `[]` | OPT | Target skipped if feature not enabled; **key for conditional compilation**; no effect on `[lib]` |
| `edition` | Rust edition override | Inherits `[package].edition` | | Deprecated |

### `[[example]]` Fields

Repeatable.

| Field | Purpose | Default | OPT | Notes |
|-------|---------|---------|-----|-------|
| `name` | Example name | required | | |
| `path` | Source file | `examples/<name>.rs` | | |
| `test` | Include `#[test]` functions in `cargo test` | `false` | OPT | Set `true` to run tests in examples |
| `bench` | Include in `cargo bench` | `false` | OPT | |
| `doc` | Include in docs | `false` | OPT | |
| `harness` | libtest test runner on/off | `true` | OPT | |
| `crate-type` | Output type | `["bin"]` | OPT | Can be set to `["cdylib"]` for `.so`/`.dll` example artifacts |
| `required-features` | Features needed to build | `[]` | OPT | Example skipped when feature absent |
| `edition` | Rust edition override | Inherits `[package].edition` | | Deprecated |

### `[[test]]` Fields

Repeatable.

| Field | Purpose | Default | OPT | Notes |
|-------|---------|---------|-----|-------|
| `name` | Test binary name | required | | |
| `path` | Source file | `tests/<name>.rs` | | |
| `test` | Runs on `cargo test` | `true` | | |
| `harness` | libtest test runner on/off | `true` | OPT | `false` = custom test runner (e.g. libtest-mimic); nextest needs it to follow its harness rules |
| `required-features` | Features needed | `[]` | OPT | |
| `edition` | Rust edition override | Inherits `[package].edition` | | Deprecated |

### `[[bench]]` Fields

Repeatable.

| Field | Purpose | Default | OPT | Notes |
|-------|---------|---------|-----|-------|
| `name` | Benchmark binary name | required | | |
| `path` | Source file | `benches/<name>.rs` | | |
| `bench` | Runs on `cargo bench` | `true` | | |
| `harness` | libtest test runner on/off | `true` | OPT | Set `false` for Criterion.rs or custom runners on stable Rust |
| `required-features` | Features needed | `[]` | OPT | |
| `edition` | Rust edition override | Inherits `[package].edition` | | Deprecated |

## `crate-type` Values (Critical: Controls Artifact Type and Link Behavior)

| Value | Output | Use Case | Notes |
|-------|--------|----------|-------|
| `"lib"` | rlib (default Rust lib) | Normal dependency | Cargo default; resolved to rlib or dylib as needed |
| `"rlib"` | `.rlib` Rust archive | Explicit Rust-linkable lib | Static; Rust ABI only |
| `"dylib"` | `.so` / `.dll` / `.dylib` Rust ABI lib | Plugin systems, Cargo itself | Rust ABI; fragile between compiler versions |
| `"cdylib"` | `.so` / `.dll` / `.dylib` C-ABI shared lib | FFI, WASM, Python/Node extensions | Stable C ABI; smaller artifact for FFI consumers |
| `"staticlib"` | `.a` / `.lib` C static archive | Embedding into C/C++ projects | All deps bundled; large but self-contained |
| `"proc-macro"` | Compiler plugin `.so` | Derive macros, attribute macros | Loaded by rustc at compile time |
| `"bin"` | Executable binary | Always the type for `[[bin]]` | Not configurable for bin targets |

Multiple types can be listed: `crate-type = ["cdylib", "rlib"]` generates both artifacts.

## Auto-Discovery Edition Behavior

| Edition | `auto*` default if any manual target defined (2015) | `auto*` default (2018+) |
|---------|-----------------------------------------------------|------------------------|
| 2015 | `false` | n/a |
| 2018+ | n/a | `true` |

Availability: `autobins`/`autoexamples`/`autotests`/`autobenches` since Rust 1.27; `autolib` since Rust 1.83.

## Other Manifest Sections (Non-Target)

| Section | Purpose | Ref |
|---------|---------|-----|
| `[dependencies]` | Runtime library dependencies | [specifying-dependencies](https://doc.rust-lang.org/cargo/reference/specifying-dependencies.html) |
| `[dev-dependencies]` | Deps for examples/tests/benches | same |
| `[build-dependencies]` | Deps for `build.rs` | same |
| `[target.<cfg>.dependencies]` | cfg-gated deps (OS, arch, `target_feature`; never `cfg(feature = …)`) | same |
| `[features]` | Conditional compilation features | [features](https://doc.rust-lang.org/cargo/reference/features.html) |
| `[lints]` | Lint config (`[lints.rust]`, `[lints.clippy]`), Rust 1.74+ | levels: `forbid`/`deny`/`warn`/`allow`; `priority` field (signed int) |
| `[hints]` | Compilation hints | No stable hints currently |
| `[badges]` | Registry maintenance status badges | `maintenance.status` field; no longer shown by crates.io, use the README |
| `[profile.*]` | Compiler codegen profiles (opt-level, debug, lto); workspace root only | [profiles](https://doc.rust-lang.org/cargo/reference/profiles.html) |
| `[patch]` | Override/replace dependency versions; workspace root only | [overriding-dependencies](https://doc.rust-lang.org/cargo/reference/overriding-dependencies.html) |
| `[replace]` | Override deps (deprecated) | same |
| `[workspace]` | Workspace definition | [workspaces](https://doc.rust-lang.org/cargo/reference/workspaces.html) |
| `[package.metadata.*]` | Custom tool config (Cargo ignores) | e.g., `[package.metadata.android]` |

## Publishing Requirements (crates.io)

Minimum required: `name`, `version`, `description`, `license` OR `license-file`. Field limits (name / keywords / categories) live in `crates-io-metadata.md`.

## Build/Publish Impact: Key Fields

Why each field matters for build speed or publish size (detail in the tables above):

| Field | Why it matters |
|-------|----------------|
| `rust-version` | locks MSRV; shapes resolver + lint behavior |
| `edition` | 2021/2024 give better ergonomics; default resolver v2 (2021) or v3 (2024) |
| `include` / `exclude` | controls published package size (`include` is the explicit, recommended one) |
| `build = false` | drops build-script overhead when none is needed |
| `autolib` / `autobins` / etc. | disabling when targets are explicit avoids filesystem scanning |
| `test = false` / `bench = false` | skips compiling targets that need no testing or benchmarking |

## Checklist

Run over your own diff:

- [ ] `[package]` has `edition`; `rust-version` is a bare version.
- [ ] Hyphenated key names only (`dev-dependencies`, `default-features`, `crate-type`).
- [ ] No `authors`, no `[badges]`, no `edition` inside a target table.
- [ ] `links` only in a package with a `build.rs`.
- [ ] A bench or test with its own `main` has `harness = false`.
- [ ] `[profile.*]`, `[patch]`, `resolver` sit in the workspace root; members inherit lints with `[lints] workspace = true`.
- [ ] `include`/`exclude` changed: `cargo package --list` checked.
- [ ] A private package has `publish = false`.
