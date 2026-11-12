# .cargo/config.toml Reference

Load when editing `.cargo/config.toml` or a `CARGO_*` variable: linker, `rustflags`, wrappers, registries, `[env]`, aliases.
Profile fields: `profiles.md`. rustc flags: `rustc-flags.md`.

> _Captured 2026-07-10 (Rust/Cargo stable), audited against the Rust/Cargo 1.99 docs. To update: re-fetch the source URL(s) below, then diff for changes._

**Official source:** https://doc.rust-lang.org/cargo/reference/config.html

## Disambiguation: config.toml vs Cargo.toml

| File | Location | Purpose |
|------|----------|---------|
| `Cargo.toml` | workspace/package root | package manifest: deps, features, profile definitions, workspace membership |
| `.cargo/config.toml` | any ancestor dir or `$CARGO_HOME` | **toolchain/environment config**: compiler flags, linkers, source overrides, env vars |

`Cargo.toml` defines what to build. `.cargo/config.toml` defines how to build it. Profile definitions live in `Cargo.toml`; profile overrides can appear in both.

## File Hierarchy & Precedence

Cargo walks up from **cwd** (the invocation's current directory, not the workspace root), loading every `.cargo/config.toml` it finds along that ancestor chain up to the filesystem root, then `$CARGO_HOME`. Merges all; deeper = higher precedence.

```
<cwd>/.cargo/config.toml          ← highest priority
<parent>/.cargo/config.toml
...
$HOME/.cargo/config.toml          ← $CARGO_HOME, lowest priority
```

**Full precedence stack (high -> low):**
1. `--config KEY=VALUE` CLI flags, or `--config <path>` to an extra config file (merged left-to-right like config files: the last scalar wins, arrays are joined)
2. `CARGO_*` environment variables: key `net.git-fetch-with-cli` -> `CARGO_NET_GIT_FETCH_WITH_CLI` (uppercase; dots and dashes become underscores). Only keys with an env name in their table accept one
3. Config files (deeper dir overrides ancestor)
4. `$CARGO_HOME/config.toml` (global user default)

**Format notes:**
- `.cargo/config` (no `.toml`) is still read for backward compat; `config.toml` is the preferred form, and if both exist the extension-less file wins
- TOML format only; no JSON or YAML
- Arrays are concatenated, with higher-precedence items appended later; a program path with arguments (`runner`) is replaced instead (Cargo 1.86+)
- Discovery is **cwd-based, not workspace-anchored**: cargo run inside a member directory reads that member's `.cargo/config.toml`; run from the workspace root it does NOT. Only cwd's ancestor chain matters, so put shared config in the workspace-root `.cargo/config.toml`.

**`[include]`**: load additional config files inline:
```toml
include = ["shared.toml", { path = "optional.toml", optional = true }]
```
Included files load first; the including file wins on conflict. Only paths ending in `.toml` are accepted.

## [build]

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
| `rustdocflags` | string or array | none | `CARGO_ENCODED_RUSTDOCFLAGS` / `RUSTDOCFLAGS` / `CARGO_BUILD_RUSTDOCFLAGS` | extra flags for rustdoc; same four-source precedence as `rustflags` |
| `incremental` | bool | from profile; `false` when `CI` is set (1.99+) | `CARGO_INCREMENTAL` / `CARGO_BUILD_INCREMENTAL` | override profile incremental setting globally |
| `dep-info-basedir` | path | none | `CARGO_BUILD_DEP_INFO_BASEDIR` | strip path prefix from dep-info files (for build systems that watch deps) |

**rustflags precedence: four mutually exclusive sources, first match wins (they do not merge across tiers):**
1. `CARGO_ENCODED_RUSTFLAGS` env
2. `RUSTFLAGS` env
3. Target tier: all matching `[target.<triple>].rustflags` **and** `[target.'cfg(...)'].rustflags` entries, joined into one list (the order inside the tier is undocumented: never rely on it)
4. `[build].rustflags`: fallback only, used when no target-tier entry matches; dropped entirely the moment one does

An exported `RUSTFLAGS` therefore switches off every `rustflags` key in config. Use one source.

**Note on `--target`:** when cross-compiling, target-tier rustflags only reach the target compiler. Build scripts and proc-macros (host artifacts) are not affected. Without `--target` the flags reach every rustc invocation, build scripts and proc-macros included: pass `--target` whenever the flags are target-only.

**`rustc-wrapper` vs `rustc-workspace-wrapper`:** both active at once nest as:
```
$RUSTC_WRAPPER $RUSTC_WORKSPACE_WRAPPER $RUSTC <args>
```

## CI Warning Gate: `build.warnings`

Cargo 1.97+: turn warnings from local packages into errors with config.

```toml
# .cargo/config.toml, or CARGO_BUILD_WARNINGS=deny in the CI job's env
[build]
warnings = "deny"   # "warn" (default) | "allow" | "deny"
```

- CI command: `cargo clippy --all-targets --all-features`. A bare `cargo clippy` exits 0 on warnings.
- Wrong: `RUSTFLAGS="-Dwarnings"`. It reaches dependencies too and invalidates the build cache.
- Cargo before 1.97 ignores the key (the gate never fires): use `cargo clippy -- -Dwarnings`.

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

Linking is often the biggest incremental build bottleneck. Set the linker per target (the same flags under `[build].rustflags` apply to all targets):

```toml
[target.x86_64-unknown-linux-gnu]
linker = "clang"
rustflags = ["-C", "link-arg=-fuse-ld=mold"]
```

mold is the fastest on Linux (MIT license). If `mold` is not on `PATH`, give the full path: `link-arg=-fuse-ld=/usr/bin/mold`.

lld (LLVM linker; Linux/macOS/Windows; bundled in the rustup toolchain as `rust-lld` for years; default linker on x86_64-linux since 1.90):

`linker = "rust-lld"` alone does **not** work on `x86_64-unknown-linux-gnu`: rust-lld does run (rustc uses its own bundled copy at `<sysroot>/lib/rustlib/x86_64-unknown-linux-gnu/bin/rust-lld` even though it isn't on `PATH`), but it's invoked as a bare ld-flavor linker with none of the system library search paths a cc driver normally injects, so the link fails: `rust-lld: error: unable to find library -lc`. Use one of these stable alternatives instead:

```toml
# (a) clang driver + system lld (needs clang + lld installed)
[target.x86_64-unknown-linux-gnu]
linker = "clang"
rustflags = ["-C", "link-arg=-fuse-ld=lld"]
```

```toml
# (b) default cc/gcc driver + rustup's bundled lld (no extra deps)
[target.x86_64-unknown-linux-gnu]
rustflags = [
    "-C", "link-arg=-B<sysroot>/lib/rustlib/x86_64-unknown-linux-gnu/bin/gcc-ld",
    "-C", "link-arg=-fuse-ld=lld",
]
```

(`-C linker-features=+lld -C link-self-contained=+linker` is not a stable opt-in: on `x86_64-unknown-linux-gnu` only the opt-outs `-lld` / `-linker` are stable, lld being the default there since 1.90; on other targets the flags need nightly `-Z unstable-options`.)

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
jobs = -1  # logical CPUs minus one (negative = CPUs + value); leave unset for all CPUs
# or explicit: jobs = 8
```

Useful to reduce jobs on machines with low RAM (each rustc invocation peaks ~1GB).

## Runtime-Speed Lever: `target-cpu=native`

Not a build-speed lever. If anything it slows compilation (deeper codegen passes to exploit the extra instructions) in exchange for faster generated code:

```toml
[build]
rustflags = ["-C", "target-cpu=native"]
```

**Warning:** binaries are non-portable. Do not use for distributed builds or cross-compilation. CI artifacts built with `native` will crash on older CPUs.

## [target.\<triple\>] and [target.'cfg(...)']

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

Never match on `debug_assertions`, `test`, a Cargo `feature`, or a cfg set by a build script in these keys: such a table silently never applies.

**Precedence when both a triple and a cfg() table match** differs by key:
- `linker` / `runner`: `[target.<triple>]` wins over `[target.'cfg(...)']` (it's an error if more than one `cfg()` table's `linker` matches).
- `rustflags` / `rustdocflags`: entries from every matching triple + cfg table are **joined together** (see the rustflags precedence note under `[build]` above); neither one "wins".

**Build script override** (`target.<triple>.<links-key>`): skip build script entirely and supply its output directly:
```toml
[target.x86_64-unknown-linux-gnu.openssl]
rustc-link-lib = ["ssl", "crypto"]
rustc-link-search = ["/usr/lib"]
```

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

A `package` override cannot set `panic`, `lto` or `rpath`. Every profile field, with values and build impact, lives in `references/profiles.md`.

## [registries] / [registry] / [source]

### [registry] (Default)

```toml
[registry]
default = "crates-io"
global-credential-providers = ["cargo:token"]
```

Never write `registry.index`: Cargo no longer accepts it.

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

**Source keys:** `replace-with` (redirect this source to another named source), `directory` (vendored crates), `registry` (index URL), `local-registry` (path on disk), `git` (URL) with `branch`/`tag`/`rev`.

**Tokens** never go in `config.toml`: a committed token is a leaked credential.

```toml
# wrong: .cargo/config.toml (committed)
[registry]
token = "cio_secret_token_here"
```

```bash
cargo login                        # right: paste at the prompt; saved to $CARGO_HOME/credentials.toml
export CARGO_REGISTRY_TOKEN="..."  # right in CI (CARGO_REGISTRIES_<NAME>_TOKEN for a named registry)
```

`cargo login <token>` is deprecated since 1.86: the argument lands in shell history.

## [alias]

```toml
[alias]
rr = "run --release"
br = ["build", "--release", "--workspace"]
clippy-strict = ["clippy", "--", "-D", "warnings"]
```

- Values: space-separated string or array of strings
- Aliases are recursive (aliases can reference other aliases)
- Cannot override built-in cargo commands. `b`, `c`, `d`, `t`, `r`, `rm` are built-in aliases already: do not redefine them
- Env: `CARGO_ALIAS_<NAME>`

## [net]

| Key | Type | Default | Env | Purpose |
|-----|------|---------|-----|---------|
| `retry` | int | 3 | `CARGO_NET_RETRY` | retries on network error |
| `git-fetch-with-cli` | bool | false | `CARGO_NET_GIT_FETCH_WITH_CLI` | use system `git` binary instead of libgit2 (auth agents, custom git configs) |
| `offline` | bool | false | `CARGO_NET_OFFLINE` | disable all network access, fail on missing local cache |

**`net.ssh.known-hosts`**: pinned SSH host keys, merged with system known_hosts:
```toml
[net.ssh]
known-hosts = [
    "github.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFO4Q5T0UV0SQevair9PFwoxY9dl4pQl3u5phoqJH3cF"
]
```

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
| `debug` | bool | false | `CARGO_HTTP_DEBUG` | log all HTTP activity (use with `CARGO_LOG=network=debug`); the log can hold auth tokens: redact before sharing |
| `user-agent` | string | Cargo version | `CARGO_HTTP_USER_AGENT` | custom user-agent |

## [env]

Available to build scripts, rustc, `cargo run`, `cargo build`.

```toml
[env]
# Simple key=value (does NOT override existing env):
OPENSSL_DIR = "/opt/openssl"

# Force override even if already set in shell:
TMPDIR = { value = "/fast/ramdisk", force = true }

# Config-relative path (resolved to absolute automatically):
OPENSSL_INCLUDE_DIR = { value = "vendor/openssl/include", relative = true }
```

- `relative = true` paths are resolved relative to the parent dir of `.cargo/` (i.e., the project root)
- Default behavior: skip if var already exists in environment
- `force = true`: overwrite existing env var

Useful for: vendored library paths, tool version pins, reproducible CI env. Commit variables every build needs here (workspace-root config), not in each developer's shell profile.

## [term]

Keys: `quiet`, `verbose` (bool, default false; CLI `--quiet` / `--verbose`), `color` (`"auto"` / `"always"` / `"never"`, default `"auto"`; CLI `--color`), `hyperlinks`, `unicode` (bool, auto-detected), `progress.when` (`"auto"` / `"always"` / `"never"`), `progress.width` (int), `progress.term-integration` (bool). Env: `CARGO_TERM_<KEY>`, e.g. `CARGO_TERM_PROGRESS_WHEN`.

## Other Sections (Complete)

| Section | Key purpose |
|---------|-------------|
| `[paths]` | array of local package paths used as dependency overrides (like `[patch]` but path-based). Crates-io crates only; cannot add deps or change graph structure; cannot target an unpublished local crate. Full restrictions: `references/dependencies.md` (paths Override section) |
| `[patch]` | override deps for all builds from this config; same format as `Cargo.toml [patch]`. Prefer the root `Cargo.toml`: config files are rarely committed, so teammates and CI never see a config patch |
| `[install]` | `root`: override `cargo install` output dir |
| `[doc]` | `browser`: browser to use for `cargo doc --open` |
| `[cargo-new]` | `vcs`: default VCS for new crates (`"git"`, `"none"`, etc.) |
| `[future-incompat-report]` | `frequency`: `"always"` or `"never"` |
| `[cache]` | `auto-clean-frequency`: `"never"`, `"always"`, or `"<N> seconds\|minutes\|hours\|days\|weeks\|months"` (default `"1 day"`): how often the global cache is swept |
| `[resolver]` | `incompatible-rust-versions`: `"allow"` (any Cargo) or `"fallback"` (1.84+); `lockfile-path` (1.97+) moves `Cargo.lock`. Local development only: `cargo install` ignores this table |
| `[credential-alias]` | aliases for credential provider programs |

## Canonical .cargo/config.toml Templates

### Fast Local Incremental dev Builds (Linux x86_64)

```toml
[build]
rustc-wrapper = "sccache"

[target.x86_64-unknown-linux-gnu]
linker = "clang"
rustflags = ["-C", "link-arg=-fuse-ld=mold"]
```

### Release Build for the Build Machine Only (Fast Linker + Native CPU)

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

## Checklist

- [ ] No token in any `config.toml`.
- [ ] Shared settings sit in the workspace-root `.cargo/config.toml`.
- [ ] One `rustflags` source: no exported `RUSTFLAGS` beside config `rustflags`.
- [ ] Target-only flags are built with `--target`.
- [ ] `target-cpu=native` only in builds that run on the build machine.
- [ ] No `[target.'cfg(...)']` key matches `feature`, `test` or `debug_assertions`.
- [ ] CI fails on warnings through `build.warnings` (Cargo 1.97+).
