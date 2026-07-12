# Cargo Dependency Specification & Overriding
> _Captured 2026-06-28 (Rust/Cargo stable). To update: re-fetch the source URL(s) below, then diff for changes._

Sources: [specifying-dependencies](https://doc.rust-lang.org/cargo/reference/specifying-dependencies.html) | [overriding-dependencies](https://doc.rust-lang.org/cargo/reference/overriding-dependencies.html)

---

## Version Requirement Syntax

All examples from the [official reference](https://doc.rust-lang.org/cargo/reference/specifying-dependencies.html).

### Caret `^` (Default; Bare Version = Caret)

Bare version = caret: SemVer-compatible updates, left-most non-zero component pinned (`1.2.3`/`^1.2.3` -> `>=1.2.3, <2.0.0`). The 0.x rows are the non-obvious ones:

| Spec | Resolves to |
|------|-------------|
| `0.2.3` | `>=0.2.3, <0.3.0` |
| `0.0.3` | `>=0.0.3, <0.0.4` |

### Tilde `~`

Patch-level only when minor is given (`~1.2` -> `>=1.2.0, <1.3.0`); `~1` -> `>=1.0.0, <2.0.0`. Tighter than caret; useful when a minor bump risks ABI/behavioral change.

### Wildcard `*`

| Spec | Resolves to |
|------|-------------|
| `*` | `>=0.0.0` |
| `1.*` | `>=1.0.0, <2.0.0` |
| `1.2.*` | `>=1.2.0, <1.3.0` |

**Warning**: crates.io rejects bare `*`; use only for path/git deps or internal tooling.

### Comparison Operators

```toml
foo = ">= 1.2.0"
foo = "> 1"
foo = "< 2"
foo = "= 1.2.3"      # exact pin
foo = ">= 1.2, < 1.5"  # multiple requirements (comma-separated)
```

**Opt-lever**: `= x.y.z` hard-pins, guaranteeing reproducibility at the cost of no security patches. Combine `>=` + `<` to express bounded ranges without locking to a single version.

### Pre-Releases

Excluded by default. Must be explicit: `"1.0.0-alpha"` (then alpha/beta/rc and final 1.x all match).
Do not use pre-release versions in stable library crates.

---

## Dependency Sections

| Section | When pulled in | Propagated to dependents? | Notes |
|---------|---------------|--------------------------|-------|
| `[dependencies]` | always | yes | runtime deps |
| `[dev-dependencies]` | tests, examples, benches only | no | not shipped in library |
| `[build-dependencies]` | build script (`build.rs`) only | no | build script cannot read `[dependencies]` |

**Opt-lever**: `[dev-dependencies]` bloat never reaches downstream consumers. Still worth trimming if they slow local `cargo test` cold builds.

Target-gated variants: `[target.'cfg(...)'.dev-dependencies]` and `[target.'cfg(...)'.build-dependencies]` both work.

---

## Source Kinds

### crates.io (Default Registry)

```toml
[dependencies]
serde = "1.0"
serde = { version = "1.0" }
```

### Git

```toml
[dependencies]
regex = { git = "https://github.com/rust-lang/regex.git" }
regex = { git = "...", branch = "next" }
regex = { git = "...", tag = "1.10.3" }
regex = { git = "...", rev = "0c0990399" }          # commit hash
regex = { git = "...", rev = "refs/pull/493/head" } # PR ref
```

Can layer a `version` check: `{ git = "...", branch = "next", version = "1.10.3" }`. Cargo verifies the git dep satisfies the semver constraint.

**Opt-lever**: git deps are not cached on crates.io; they re-fetch on lock changes and cannot be audited with `cargo audit`. Avoid in published crates; crates.io rejects them (except dev-deps).

### Path

```toml
[dependencies]
hello_utils = { path = "hello_utils" }
hello_utils = { path = "hello_utils", version = "0.1.0" }  # version required when publishing
```

Path must point at the directory containing `Cargo.toml`. Does not traverse up.

### Alternative Registries

```toml
[dependencies]
some-crate = { version = "1.0", registry = "my-registry" }
```

Registry must be configured in `.cargo/config.toml`.

### Multiple Locations (Local + Registry Fallback)

```toml
bitflags = { path = "my-bitflags", version = "1.0" }
```

`path` wins locally; when published, `version` is used from the registry. Standard pattern for workspace members that are published.

---

## Dependency Keys

| Key | Type | Purpose | Opt-relevance |
|-----|------|---------|---------------|
| `version` | string | semver requirement | |
| `optional` | bool | makes dep a feature gate; not compiled if feature is off | cuts compile time + binary size when feature off |
| `default-features` | bool | include crate's default feature set | **set `false` to trim transitive deps and compile time** |
| `features` | array | opt-in to specific features | additive with workspace definition |
| `package` | string | actual crate name on registry (alias it locally) | allows two versions of same crate in one `[dependencies]` |
| `registry` | string | alternative registry name | |
| `public` | bool | re-exports this dep in public API (unstable, requires `cargo-features`) | affects downstream visibility |
| `workspace` | bool | inherit from `[workspace.dependencies]` | |
| `git` | string | repo URL | |
| `branch` / `tag` / `rev` | string | git ref | |
| `path` | string | local path | |

**`default-features = false` is the single highest-impact key for cutting compile time and binary size.** Always audit what a crate's defaults pull in.

---

## Target-Specific Dependencies

```toml
[target.'cfg(windows)'.dependencies]
winhttp = "0.4.0"

[target.'cfg(unix)'.dependencies]
openssl = "1.0.1"

[target.'cfg(any(windows, target_os = "macos"))'.dependencies]
foo = "1.0"

[target.'cfg(target_arch = "x86_64")'.dependencies]
native-x86_64 = { path = "native/x86_64" }

# Full triple
[target.x86_64-pc-windows-gnu.dependencies]
winhttp = "0.4.0"
```

Supports `not`, `any`, `all` cfg operators. Custom targets: use base filename of the `.json` spec.

**Opt-lever**: target-gating deps avoids compiling OS-specific or arch-specific code on irrelevant targets. Critical for cross-compilation build times.

---

## Workspace Inheritance

A member pulls a shared dep with `{ workspace = true }` from `[workspace.dependencies]`. It may add
`optional` and extra `features` (additive; cannot remove workspace-level features); it cannot override
`version`, `default-features`, `git`, `path`, or `registry`. Centralizes version pins and
`default-features = false`, preventing multi-version bloat across members.

Worked example + `[workspace.package]` field inheritance: `references/workspaces.md`.

---

## Dependency Renaming (`package` Key)

```toml
[dependencies]
foo = "0.1"                                                              # crates.io as `foo`
bar = { git = "https://github.com/example/project.git", package = "foo" }  # git as `bar`
baz = { version = "0.1", registry = "custom", package = "foo" }         # registry as `baz`
```

Allows linking two incompatible major versions simultaneously. Feature refs use the alias:

```toml
bar = { version = "0.1", package = "foo", optional = true }

[features]
log-debug = ["bar/log-debug"]   # NOT foo/log-debug
```

---

## Overriding Dependencies

### `[patch]` (Recommended)

Overrides a source (registry or git URL) with a local path or different git ref. Applied transitively.

```toml
[patch.crates-io]
uuid = { path = "../uuid" }
serde = { git = "https://github.com/serde-rs/serde.git" }

# Override non-crates-io source
[patch."https://github.com/your/repository"]
my-library = { path = "../my-library" }

# Patch multiple versions of same crate
[patch.crates-io]
serde  = { git = "https://github.com/serde-rs/serde.git" }
serde2 = { git = "https://github.com/example/serde.git", package = "serde", branch = "v2" }
```

**Rules:**
- Only valid at workspace root; ignored in member `Cargo.toml` files.
- Version numbers still matter. Cargo uses greedy resolution (maximum matching version).
- Can be set in `.cargo/config.toml` or via `--config` CLI flag.

**Opt-lever**: `[patch]` is the primary tool for dependency deduplication. If two crates pull in different minor versions of the same dep, patch the older one to the newer. Cargo unifies them and cuts compile time + binary size. Hot-swapping a dep for a local fork during profiling/debugging works here too, without touching `[dependencies]`.

### `[replace]` (Deprecated)

```toml
[replace]
"foo:0.1.0" = { git = "https://github.com/example/foo.git" }
```

Requires exact `name:version`. Cannot change dep graph structure, cannot specify features. Use `[patch]` instead.

### `paths` Override (`.cargo/config.toml`)

```toml
paths = ["/absolute/path/to/uuid"]
```

Quick local override without touching `Cargo.toml`. Restrictions:
- Cannot add new dependencies or change graph structure
- Only works for crates-io crates
- Cannot be used for unpublished local crates
- Temporary / per-developer; not committed workflow
