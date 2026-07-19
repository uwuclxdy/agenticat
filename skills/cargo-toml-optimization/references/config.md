# .cargo/config.toml Reference
> _Captured 2026-07-10 (Rust/Cargo stable). To update: re-fetch the source URL(s) below, then diff for changes._

**Official source:** https://doc.rust-lang.org/cargo/reference/config.html

---

## Disambiguation: config.toml vs Cargo.toml

| File | Location | Purpose |
|------|----------|---------|
| `Cargo.toml` | workspace/package root | package manifest: deps, features, profile definitions, workspace membership |
| `.cargo/config.toml` | any ancestor dir or `$CARGO_HOME` | **toolchain/environment config**: compiler flags, linkers, source overrides, env vars |

`Cargo.toml` defines what to build. `.cargo/config.toml` defines how to build it. Profile definitions live in `Cargo.toml`; profile overrides can appear in both.

---

## File Hierarchy & Precedence

Cargo walks up from **cwd** (the invocation's current directory, not the workspace root), loading every
`.cargo/config.toml` it finds along that ancestor chain up to the filesystem root, then `$CARGO_HOME`.
Merges all; deeper = higher precedence.

```
<cwd>/.cargo/config.toml          ← highest priority
<parent>/.cargo/config.toml
...
$HOME/.cargo/config.toml          ← $CARGO_HOME, lowest priority
```

**Full precedence stack (high -> low):**
1. `--config KEY=VALUE` CLI flags (left-to-right, rightmost wins per key)
2. `CARGO_*` environment variables
3. Config files (deeper dir overrides ancestor)
4. `$CARGO_HOME/config.toml` (global user default)

**Format notes:**
- `.cargo/config` (no `.toml`) still accepted for backward compat, but deprecated
- TOML format only; no JSON or YAML
- Arrays are concatenated, not replaced, with higher-precedence items appended later
- Discovery is **cwd-based, not workspace-anchored**: invoking cargo from inside a workspace member
  directory DOES read that member's `.cargo/config.toml` (it's an ancestor of cwd); invoking the same
  command from the workspace root does NOT (the member dir is never an ancestor of the root).
  Workspace membership itself adds nothing to config discovery. Only cwd's own ancestor chain matters.

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

**rustflags precedence: four mutually exclusive sources, first match wins (they do not merge across
tiers):**
1. `CARGO_ENCODED_RUSTFLAGS` env
2. `RUSTFLAGS` env
3. Target tier: all matching `[target.<triple>].rustflags` **and** `[target.'cfg(...)'].rustflags`
   entries, joined into one list (triple entry first, then each matching cfg entry in config-file
   order; multiple matching cfg entries also merge with each other)
4. `[build].rustflags`: fallback only, used when no target-tier entry matches; dropped entirely the
   moment one does

**Note on `--target`:** when cross-compiling, target-tier rustflags only reach the target compiler. Build scripts and proc-macros (host artifacts) are not affected.

**`rustc-wrapper` vs `rustc-workspace-wrapper`:** both active at once nest as:
```
$RUSTC_WRAPPER $RUSTC_WORKSPACE_WRAPPER $RUSTC <args>
```

---

## High-Impact Build Speed Levers

### 1. sccache

```toml
[build]
rustc-wrapper = "sccache"
```

- Caches compiled crate artifacts per project and between CI runs
- Backed by S3/GCS/Redis for multi-machine caching
- Install: `cargo install sccache` or distro package
- `rustc-workspace-wrapper` for workspace-only caching (leaves dep caching to wrapper)

### 2. Faster Linkers (mold / lld)

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

mold (fastest on Linux, MIT license):
```toml
[target.x86_64-unknown-linux-gnu]
linker = "clang"
rustflags = ["-C", "link-arg=-fuse-ld=/usr/bin/mold"]
```

lld (LLVM linker; Linux/macOS/Windows; bundled in the rustup toolchain as `rust-lld` for years; default
linker on x86_64-linux since 1.90):

`linker = "rust-lld"` alone does **not** work on `x86_64-unknown-linux-gnu`: rust-lld does run (rustc
uses its own bundled copy at `<sysroot>/lib/rustlib/x86_64-unknown-linux-gnu/bin/rust-lld` even though
it isn't on `PATH`), but it's invoked as a bare ld-flavor linker with none of the system library search
paths a cc driver normally injects, so the link fails: `rust-lld: error: unable to find library -lc`.
Use one of these stable alternatives instead:

```toml
# (a) clang driver + system lld (needs clang + lld installed)
[target.x86_64-unknown-linux-gnu]
linker = "clang"
rustflags = ["-C", "link-arg=-fuse-ld=lld"]

# (b) default cc/gcc driver + rustup's bundled lld (no extra deps)
[target.x86_64-unknown-linux-gnu]
rustflags = [
    "-C", "link-arg=-B<sysroot>/lib/rustlib/x86_64-unknown-linux-gnu/bin/gcc-ld",
    "-C", "link-arg=-fuse-ld=lld",
]
```

(`-C linker-features=+lld -C link-self-contained=+linker` looks like a modern stable replacement but
is not: on current stable it still requires `-Z unstable-options`, i.e. nightly.)

### 3. Shared target-dir

Avoid recompiling common dependencies per-project:
```toml
# $CARGO_HOME/config.toml
[build]
target-dir = "/path/to/shared-target"
```

Or per-workspace in `.cargo/config.toml`:
```toml
[build]
build-dir = "{cargo-cache-home}/build/{workspace-path-hash}"
```

`build-dir` template vars let multiple workspaces share a central build cache without collisions.

### 4. jobs Tuning

```toml
[build]
jobs = -1  # all CPUs
# or explicit:
jobs = 8
```

Useful to reduce jobs on machines with low RAM (each rustc invocation peaks ~1GB).

---

## Runtime-Speed Lever: `target-cpu=native`

Not a build-speed lever. If anything it slows compilation (deeper codegen passes to exploit the extra
instructions) in exchange for faster generated code:

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

**Precedence when both a triple and a cfg() table match** differs by key:
- `linker` / `runner`: `[target.<triple>]` wins over `[target.'cfg(...)']` (it's an error if more than
  one `cfg()` table's `linker` matches).
- `rustflags` / `rustdocflags`: entries from every matching triple + cfg table are **joined together**
  (see the rustflags precedence note under `[build]` above); neither one "wins".

**Build script override** (`target.<triple>.<links-key>`): skip build script entirely and supply its output directly:
```toml
[target.x86_64-unknown-linux-gnu.openssl]
rustc-link-lib = ["ssl", "crypto"]
rustc-link-search = ["/usr/lib"]
```

---

## [profile.\<name\>] Overrides in config.toml

Profile definitions belong in `Cargo.toml`; `config.toml` can override any profile field. Config overrides win over `Cargo.toml` profile settings.

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

Every profile field, with values and build impact, lives in `references/profiles.md`.

---

## [registries] / [registry] / [source]

### [registry] (Default)

```toml
[registry]
default = "crates-io"
global-credential-providers = ["cargo:token"]
```

### [registries.\<name\>] (Named Registry)

```toml
[registries.my-registry]
index = "https://my-registry.example.com/index"
credential-provider = "cargo:token"
```

```toml
[registries.crates-io]
protocol = "sparse"  # "sparse" (default, fast) or "git" (full clone)
```

### [source] (Source Replacement and Vendoring)

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

- `relative = true` paths are resolved relative to the parent dir of `.cargo/` (i.e., the project root)
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

## Other Sections (Complete)

| Section | Key purpose |
|---------|-------------|
| `[paths]` | array of local package paths used as dependency overrides (like `[patch]` but path-based). Crates-io crates only; cannot add deps or change graph structure; cannot target an unpublished local crate. Full restrictions: `references/dependencies.md` (paths Override section) |
| `[patch]` | override deps for all builds from this config; same format as `Cargo.toml [patch]` |
| `[install]` | `root`: override `cargo install` output dir |
| `[doc]` | `browser`: browser to use for `cargo doc --open` |
| `[cargo-new]` | `vcs`: default VCS for new crates (`"git"`, `"none"`, etc.) |
| `[future-incompat-report]` | `frequency`: `"always"` or `"never"` |
| `[cache]` | `auto-clean-frequency`: `"1 day"`, `"never"`; triggers global cache cleanup |
| `[resolver]` | `incompatible-rust-versions`: `"allow"` or `"fallback"` (Cargo 1.84+) |
| `[credential-alias]` | aliases for credential provider programs |

---

## Canonical .cargo/config.toml Templates

### Fast Local Incremental dev Builds (Linux x86_64)

```toml
[build]
rustc-wrapper = "sccache"
jobs = -1            # all CPUs

[target.x86_64-unknown-linux-gnu]
linker = "clang"
rustflags = ["-C", "link-arg=-fuse-ld=mold"]

[profile.dev]
incremental = true
```

### Release / CI (Fast Linker + Native CPU)

```toml
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

### Offline Vendored CI

```toml
[source.crates-io]
replace-with = "vendored-sources"

[source.vendored-sources]
directory = "vendor"

[net]
offline = true
```
