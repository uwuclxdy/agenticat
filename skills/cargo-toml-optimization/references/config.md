# .cargo/config.toml reference
> _Captured 2026-06-28 (Rust/Cargo stable). To update: re-fetch the source URL(s) below, then diff for changes._

**Official source:** https://doc.rust-lang.org/cargo/reference/config.html

---

## Disambiguation: config.toml vs Cargo.toml

| File | Location | Purpose |
|------|----------|---------|
| `Cargo.toml` | workspace/package root | **package manifest**: deps, features, profile definitions, workspace membership |
| `.cargo/config.toml` | any ancestor dir or `$CARGO_HOME` | **toolchain/environment config**: compiler flags, linkers, source overrides, env vars |

`Cargo.toml` defines *what to build*. `.cargo/config.toml` defines *how to build it*. Profile *definitions* live in `Cargo.toml`; profile *overrides* can appear in both.

---

## File Hierarchy & Precedence

Cargo walks up from cwd, loads every `.cargo/config.toml` it finds. Merges all; deeper = higher precedence.

```
<cwd>/.cargo/config.toml          ← highest priority
<parent>/.cargo/config.toml
...
$HOME/.cargo/config.toml          ← $CARGO_HOME, lowest priority
```

**Full precedence stack (high → low):**
1. `--config KEY=VALUE` CLI flags (left-to-right, rightmost wins per key)
2. `CARGO_*` environment variables
3. Config files (deeper dir overrides ancestor)
4. `$CARGO_HOME/config.toml` (global user default)

**Format notes:**
- `.cargo/config` (no `.toml`) still accepted for backward compat, but deprecated
- TOML format only; no JSON or YAML
- Arrays are **concatenated** (not replaced), with higher-precedence items appended later
- Workspace invocation: Cargo does NOT read config from individual member crate dirs. Only searches workspace root upward.

**`[include]`**: load additional config files inline:
```toml
include = ["shared.toml", { path = "optional.toml", optional = true }]
```
Included files load first; the including file wins on conflict.

---

## [build]

**Governs compiler selection, parallelism, flags, output dirs.**

| Key | Type | Default | Env | Purpose |
|-----|------|---------|-----|---------|
| `jobs` | int or `"default"` | logical CPU count | `CARGO_BUILD_JOBS` | parallel rustc invocations; negative = CPUs + value |
| `rustc` | path | `"rustc"` | `RUSTC` / `CARGO_BUILD_RUSTC` | rustc binary override |
| `rustc-wrapper` | path | none | `RUSTC_WRAPPER` / `CARGO_BUILD_RUSTC_WRAPPER` | wraps ALL rustc invocations (sccache goes here) |
| `rustc-workspace-wrapper` | path | none | `RUSTC_WORKSPACE_WRAPPER` / `CARGO_BUILD_RUSTC_WORKSPACE_WRAPPER` | wraps workspace member rustc only |
| `rustdoc` | path | `"rustdoc"` | `RUSTDOC` / `CARGO_BUILD_RUSTDOC` | rustdoc binary override |
| `target` | string or array | host triple | `CARGO_BUILD_TARGET` | default cross-compile target(s) |
| `target-dir` | path | `"target"` | `CARGO_TARGET_DIR` / `CARGO_BUILD_TARGET_DIR` | output dir for all compiler artifacts |
| `build-dir` | path | = `target-dir` | `CARGO_BUILD_BUILD_DIR` | intermediate artifact dir; accepts `{workspace-root}`, `{cargo-cache-home}`, `{workspace-path-hash}` templates |
| `rustflags` | string or array | none | `RUSTFLAGS` / `CARGO_BUILD_RUSTFLAGS` / `CARGO_ENCODED_RUSTFLAGS` | extra flags for every rustc invocation |
| `rustdocflags` | string or array | none | `RUSTDOCFLAGS` / `CARGO_BUILD_RUSTDOCFLAGS` | extra flags for rustdoc |
| `incremental` | bool | from profile | `CARGO_INCREMENTAL` / `CARGO_BUILD_INCREMENTAL` | override profile incremental setting globally |
| `dep-info-basedir` | path | none | `CARGO_BUILD_DEP_INFO_BASEDIR` | strip path prefix from dep-info files (for build systems that watch deps) |

**rustflags precedence (high → low):**
`CARGO_ENCODED_RUSTFLAGS` > `RUSTFLAGS` > `[target.<triple>].rustflags` > `[build].rustflags`

**Note on `--target`:** when cross-compiling, `[build].rustflags` only reaches the target compiler. Build scripts and proc-macros (host artifacts) are not affected.

**`rustc-wrapper` vs `rustc-workspace-wrapper`:** both active at once nest as:
```
$RUSTC_WRAPPER $RUSTC_WORKSPACE_WRAPPER $RUSTC <args>
```

---

## High-impact Build Speed Levers

### 1. sccache

```toml
[build]
rustc-wrapper = "sccache"
```

- Caches compiled crate artifacts per project and between CI runs
- Backed by S3/GCS/Redis for multi-machine caching
- Install: `cargo install sccache` or distro package
- `rustc-workspace-wrapper` for workspace-only caching (leaves dep caching to wrapper)

### 2. Faster linkers (mold / lld)

Linking is often the biggest incremental build bottleneck. Two approaches:

**Via `[target.<triple>].linker`** (cleaner, per-target):
```toml
[target.x86_64-unknown-linux-gnu]
linker = "clang"
rustflags = ["-C", "link-arg=-fuse-ld=mold"]

# or with lld directly:
[target.x86_64-unknown-linux-gnu]
linker = "clang"
rustflags = ["-C", "link-arg=-fuse-ld=lld"]
```

**Via `[build].rustflags`** (applies to all targets):
```toml
[build]
rustflags = ["-C", "linker=clang", "-C", "link-arg=-fuse-ld=mold"]
```

**mold** (fastest on Linux, MIT license):
```toml
[target.x86_64-unknown-linux-gnu]
linker = "clang"
rustflags = ["-C", "link-arg=-fuse-ld=/usr/bin/mold"]
```

**lld** (LLVM linker; Linux/macOS/Windows; ships with rustup as `rust-lld` since ~1.71):
```toml
[target.x86_64-unknown-linux-gnu]
linker = "rust-lld"
```

### 3. target-cpu=native

Emit instructions for the exact CPU running the build:
```toml
[build]
rustflags = ["-C", "target-cpu=native"]
```

Or scoped to a specific target triple:
```toml
[target.x86_64-unknown-linux-gnu]
rustflags = ["-C", "target-cpu=native"]
```

**Warning:** binaries are non-portable. Do not use for distributed builds or cross-compilation. CI artifacts built with `native` will crash on older CPUs.

### 4. Shared target-dir

Avoid recompiling common dependencies per-project:
```toml
# $CARGO_HOME/config.toml
[build]
target-dir = "/home/user/.cargo/target-shared"
```

Or per-workspace in `.cargo/config.toml`:
```toml
[build]
build-dir = "{cargo-cache-home}/build/{workspace-path-hash}"
```

`build-dir` template vars let multiple workspaces share a central build cache without collisions.

### 5. jobs tuning

```toml
[build]
jobs = -1  # all CPUs
# or explicit:
jobs = 8
```

Useful to **reduce** jobs on machines with low RAM (each rustc invocation peaks ~1GB).

---

## [target.\<triple\>] and [target.'cfg(...)']

Per-target and per-cfg-expression configuration.

| Key | Type | Env var | Purpose |
|-----|------|---------|---------|
| `linker` | path | `CARGO_TARGET_<TRIPLE>_LINKER` | linker passed to rustc via `-C linker=` |
| `runner` | string or array | `CARGO_TARGET_<TRIPLE>_RUNNER` | wrapper to run test/bench/run binaries |
| `rustflags` | string or array | `CARGO_TARGET_<TRIPLE>_RUSTFLAGS` | target-specific rustc flags |
| `rustdocflags` | string or array | `CARGO_TARGET_<TRIPLE>_RUSTDOCFLAGS` | target-specific rustdoc flags |

**cfg() expressions:**
```toml
[target.'cfg(target_os = "linux")']
rustflags = ["-C", "target-feature=+crt-static"]

[target.'cfg(all(target_arch = "arm", target_os = "none"))']
linker = "arm-none-eabi-gcc"
runner = ["qemu-arm", "-cpu", "cortex-m4"]
```

**Precedence when both triple and cfg match:** `[target.<triple>]` wins over `[target.'cfg(...)']`.

**Build script override** (`target.<triple>.<links-key>`): skip build script entirely and supply its output directly:
```toml
[target.x86_64-unknown-linux-gnu.openssl]
rustc-link-lib = ["ssl", "crypto"]
rustc-link-search = ["/usr/lib"]
```

---

## [profile.\<name\>] Overrides in config.toml

Profile definitions belong in `Cargo.toml`; `config.toml` can **override** any profile field. Config overrides win over `Cargo.toml` profile settings.

```toml
[profile.release]
lto = "thin"
codegen-units = 1

[profile.dev]
incremental = true

# Override a specific package inside a profile:
[profile.release.package.image]
opt-level = 3

# Override build scripts / proc-macros inside release:
[profile.release.build-override]
opt-level = 0
codegen-units = 256
```

| Key | Values | Build/binary impact |
|-----|--------|----------------------|
| `opt-level` | 0-3, `"s"`, `"z"` | core speed/size tradeoff |
| `lto` | `false`, `"thin"`, `"fat"`, `true` | link-time inlining; `"thin"` = good speed/time balance |
| `codegen-units` | int | lower = better codegen, slower compile |
| `incremental` | bool | false in release = smaller, reproducible builds |
| `panic` | `"unwind"`, `"abort"` | `"abort"` reduces binary size, faster panic path |
| `strip` | `"none"`, `"debuginfo"`, `"symbols"` | reduces binary size for distribution |
| `debug` | 0-2, bool | debug info level |
| `rpath` | bool | embed library search path |

---

## [registries] / [registry] / [source]

### [registry] — default registry config

```toml
[registry]
default = "crates-io"
global-credential-providers = ["cargo:token"]
```

### [registries.\<name\>] — named registry

```toml
[registries.my-registry]
index = "https://my-registry.example.com/index"
credential-provider = "cargo:token"
```

```toml
[registries.crates-io]
protocol = "sparse"  # "sparse" (default, fast) or "git" (full clone)
```

### [source] — source replacement and vendoring

**Vendoring for offline/reproducible CI:**
```toml
[source.crates-io]
replace-with = "vendored-sources"

[source.vendored-sources]
directory = "vendor"
```

Generate vendor dir with `cargo vendor`. Then builds are fully offline.

**Source types:**

| Key | Type | Purpose |
|-----|------|---------|
| `replace-with` | string | redirect this source to another named source |
| `directory` | path | local directory source (vendored crates) |
| `registry` | URL | registry index URL |
| `local-registry` | path | local registry on disk |
| `git` | URL | git repository source |
| `branch`/`tag`/`rev` | string | git ref for git source |

**Tokens** go in `$CARGO_HOME/credentials.toml` (managed by `cargo login`), not in `config.toml`.

---

## [alias]

Custom cargo subcommand aliases.

```toml
[alias]
b = "build"
c = "check"
t = "test"
r = "run"
rr = "run --release"
br = ["build", "--release", "--workspace"]
clippy-strict = ["clippy", "--", "-D", "warnings"]
```

- Values: space-separated string or array of strings
- Aliases are recursive (aliases can reference other aliases)
- Cannot override built-in cargo commands
- Env: `CARGO_ALIAS_<NAME>`

---

## [net]

| Key | Type | Default | Env | Purpose |
|-----|------|---------|-----|---------|
| `retry` | int | 3 | `CARGO_NET_RETRY` | retries on network error |
| `git-fetch-with-cli` | bool | false | `CARGO_NET_GIT_FETCH_WITH_CLI` | use system `git` binary instead of libgit2 (auth agents, custom git configs) |
| `offline` | bool | false | `CARGO_NET_OFFLINE` | disable all network access, fail on missing local cache |

```toml
[net]
retry = 5
offline = false
git-fetch-with-cli = true  # needed for SSH agents or .gitconfig auth helpers
```

**`net.ssh.known-hosts`**: pinned SSH host keys, merged with system known_hosts:
```toml
[net.ssh]
known-hosts = [
    "github.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFO4Q5T0UV0SQevair9PFwoxY9dl4pQl3u5phoqJH3cF"
]
```

---

## [http]

| Key | Type | Default | Env | Purpose |
|-----|------|---------|-----|---------|
| `proxy` | string | none | `CARGO_HTTP_PROXY` | HTTP/HTTPS/SOCKS proxy |
| `timeout` | int (sec) | 30 | `CARGO_HTTP_TIMEOUT` | per-request timeout |
| `low-speed-limit` | int (B/s) | 10 | `CARGO_HTTP_LOW_SPEED_LIMIT` | abort+retry if below this speed for `timeout` seconds |
| `multiplexing` | bool | true | `CARGO_HTTP_MULTIPLEXING` | HTTP/2 multiplexing (fewer connections, faster fetches) |
| `cainfo` | path | system certs | `CARGO_HTTP_CAINFO` | custom CA bundle for TLS |
| `check-revoke` | bool | true (Win) | `CARGO_HTTP_CHECK_REVOKE` | TLS cert revocation check |
| `ssl-version` | string or {min,max} | tlsv1.0+ | `CARGO_HTTP_SSL_VERSION` | TLS version constraint |
| `debug` | bool | false | `CARGO_HTTP_DEBUG` | log all HTTP activity (use with `CARGO_LOG=network=debug`) |
| `user-agent` | string | Cargo version | `CARGO_HTTP_USER_AGENT` | custom user-agent |

---

## [env]

Available to build scripts, rustc, `cargo run`, `cargo build`.

```toml
[env]
# Simple key=value (does NOT override existing env):
OPENSSL_DIR = "/opt/openssl"

# Force override even if already set in shell:
TMPDIR = { value = "/fast/ramdisk", force = true }

# Config-relative path (resolved to absolute automatically):
OPENSSL_DIR = { value = "vendor/openssl", relative = true }
```

- `relative = true` paths are resolved relative to the **parent dir of `.cargo/`** (i.e., the project root)
- Default behavior: skip if var already exists in environment
- `force = true`: overwrite existing env var

Useful for: vendored library paths, tool version pins, reproducible CI env.

---

## [term]

| Key | Type | Default | Env | CLI override |
|-----|------|---------|-----|-------------|
| `quiet` | bool | false | `CARGO_TERM_QUIET` | `--quiet` / `--verbose` |
| `verbose` | bool | false | `CARGO_TERM_VERBOSE` | `--quiet` / `--verbose` |
| `color` | `"auto"` / `"always"` / `"never"` | `"auto"` | `CARGO_TERM_COLOR` | `--color` |
| `hyperlinks` | bool | auto | `CARGO_TERM_HYPERLINKS` | n/a |
| `unicode` | bool | auto | `CARGO_TERM_UNICODE` | n/a |
| `progress.when` | `"auto"` / `"always"` / `"never"` | `"auto"` | `CARGO_TERM_PROGRESS_WHEN` | n/a |
| `progress.width` | int | none | `CARGO_TERM_PROGRESS_WIDTH` | n/a |
| `progress.term-integration` | bool | auto | `CARGO_TERM_PROGRESS_TERM_INTEGRATION` | n/a |

---

## Other Sections (complete)

| Section | Key purpose |
|---------|-------------|
| `[paths]` | array of local package paths used as dependency overrides (like `[patch]` but path-based) |
| `[patch]` | override deps for all builds from this config; same format as `Cargo.toml [patch]` |
| `[install]` | `root`: override `cargo install` output dir |
| `[doc]` | `browser`: browser to use for `cargo doc --open` |
| `[cargo-new]` | `vcs`: default VCS for new crates (`"git"`, `"none"`, etc.) |
| `[future-incompat-report]` | `frequency`: `"always"` or `"never"` |
| `[cache]` | `auto-clean-frequency`: `"1 day"`, `"never"`; triggers global cache cleanup |
| `[resolver]` | `incompatible-rust-versions`: `"allow"` or `"fallback"` (Cargo 1.84+) |
| `[credential-alias]` | aliases for credential provider programs |

---

## Canonical config.toml Templates

### Fast local dev (Linux x86_64)

```toml
# .cargo/config.toml — fast incremental dev builds

[build]
rustc-wrapper = "sccache"
jobs = -1            # all CPUs

[target.x86_64-unknown-linux-gnu]
linker = "clang"
rustflags = ["-C", "link-arg=-fuse-ld=mold"]

[profile.dev]
incremental = true
```

### Release / CI (fast linker + native CPU)

```toml
# .cargo/config.toml — CI release builds

[build]
rustc-wrapper = "sccache"

[target.x86_64-unknown-linux-gnu]
linker = "clang"
rustflags = [
    "-C", "link-arg=-fuse-ld=lld",
    "-C", "target-cpu=native",   # WARNING: non-portable binary
]

[profile.release]
lto = "thin"
codegen-units = 1
```

### Offline vendored CI

```toml
# .cargo/config.toml — fully offline, vendor/ checked in

[source.crates-io]
replace-with = "vendored-sources"

[source.vendored-sources]
directory = "vendor"

[net]
offline = true
```
