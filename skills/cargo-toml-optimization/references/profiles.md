# Cargo Profiles Reference

Load when setting or reviewing a `[profile.*]` key, a default, a custom profile or a per-package override.
Starting templates: `SKILL.md`. This file: every value and its rules.

> _Captured 2026-06-28 (Rust/Cargo stable). To update: re-fetch the source URL(s) below, then diff for changes._

> Source: https://doc.rust-lang.org/cargo/reference/profiles.html

Profiles alter compiler settings per build mode. Only the workspace root `Cargo.toml` is read; profile settings in member and dependency manifests are ignored. `[profile.*]` in `.cargo/config.toml` and `CARGO_PROFILE_<NAME>_<KEY>` env vars override the manifest.

## Settings Reference

### opt-level

Controls `-C opt-level`. Trades compile speed for runtime performance and binary size.

| Value | Effect |
|-------|--------|
| `0` | No optimizations (default: `dev`) |
| `1` | Basic inlining + constant folding |
| `2` | Most compiler passes |
| `3` | All passes including vectorization (default: `release`) |
| `"s"` | Shrink binary; may not always beat `2`/`3`, benchmark to verify |
| `"z"` | Shrink binary, disable loop vectorization; often larger than `"s"`, benchmark to verify |

Note: level `3` can be slower than `2` in some cases. Benchmarking required.

### debug

Controls `-C debuginfo`. Higher values = more debug info = larger binaries.

| Value | Effect |
|-------|--------|
| `0` / `false` / `"none"` | No debug info (default: `release`) |
| `"line-directives-only"` | Line directives only; for nvptx* profiling |
| `"line-tables-only"` | Filename + line number only; minimal backtraces |
| `1` / `"limited"` | Debug info without type/variable detail |
| `2` / `true` / `"full"` | Full debug info (default: `dev`) |

Named values require Rust 1.71+; on an older `rust-version` keep the numeric forms.

### split-debuginfo

Controls `-C split-debuginfo`. Determines whether debug info lives inside the binary or in adjacent files.

| Target OS | Cargo default |
|-----------|--------------|
| macOS (debug enabled) | `"unpacked"` |
| Others | rustc target default |

Valid values are target-dependent; see rustc docs. Setting only takes effect when `debug` is non-zero.

### strip

Controls `-C strip`. Removes symbols or debug info from the final binary.

| Value | Effect |
|-------|--------|
| `"none"` / `false` | Strip nothing (default) |
| `"debuginfo"` | Strip debug info, keep symbol names |
| `"symbols"` / `true` | Strip all symbols + debug info |

`"symbols"` makes backtraces unreadable: keep `"debuginfo"` for CLI tools, libraries and anything that reports crashes. Stripping is not a security or obfuscation measure. Unset `strip` with `debug` off (release) acts as `"debuginfo"` since Cargo 1.77; write `strip = "none"` to keep std's debuginfo.

### debug-assertions

Controls `-C debug-assertions`. Enables `cfg(debug_assertions)` and `debug_assert!`. Default: `true` in `dev`, `false` in `release`.

### overflow-checks

Controls `-C overflow-checks`. Panics on integer overflow when enabled. Default: `true` in `dev`, `false` in `release`: release arithmetic wraps silently. Set `overflow-checks = true` in `[profile.release]` when overflow must panic there.

### lto

Controls `-C lto`, `-C linker-plugin-lto`, `-C embed-bitcode`. LTO trades link time for cross-crate inlining quality.

| Value | Effect | Link time | Inlining quality |
|-------|--------|-----------|-----------------|
| `"off"` | LTO completely disabled | fastest | none |
| `false` | Thin-local LTO on codegen units only, no inter-crate LTO | fast | low |
| `"thin"` | Thin LTO, all crates | moderate | similar to fat; can beat it on large projects |
| `true` / `"fat"` | Fat LTO, all crates | slow | best on some projects, not always |

Default to `"thin"`; choose `"fat"` only when a benchmark shows it wins. When `codegen-units = 1` or `opt-level = 0`, `false` behaves the same as `"off"`. Cross-language LTO (C/C++ + Rust) requires manual `RUSTFLAGS`.

Cannot be set in `[profile.*.package.*]` overrides.

### panic

Controls `-C panic`. Affects unwind table generation and binary size.

| Value | Effect |
|-------|--------|
| `"unwind"` | Unwind stack on panic (default) |
| `"abort"` | Kills the program immediately; smaller binaries |

Restrictions:
- Tests, benchmarks, build scripts, and proc macros ignore the `panic` setting (the `rustc` test harness currently requires `unwind` behavior).
- With `"abort"`, building a test still builds its dependencies with `"unwind"`.
- Unstable `panic-abort-tests` flag exists to override test behavior.
- Some targets (e.g. nvptx) force `"abort"` unconditionally.
- If any crate in the graph is built with `"abort"`, the final binary (`bin`, `dylib`, `cdylib`, `staticlib`) must use `"abort"` too.
- Use `"abort"` only when nothing needs to unwind: no `catch_unwind`, no `Drop` cleanup that must run on panic.

Cannot be set in `[profile.*.package.*]` overrides.

### incremental

Controls `-C incremental`. Saves compilation state to disk for faster rebuilds. Default: `true` in `dev`, `false` in `release`. Keep it off in release profiles: it inhibits optimizations.

Only applies to workspace members and `path` dependencies. Overridable via `CARGO_INCREMENTAL` env var or `build.incremental` in `.cargo/config.toml`.

### codegen-units

Controls `-C codegen-units`. Splits a crate into N parallel chunks. More units = faster compile, less cross-unit inlining.

| Value | Default context |
|-------|----------------|
| `256` | Incremental builds |
| `16` | Non-incremental builds (release default) |
| `1` | Best cross-unit inlining; slowest compile |

Must be integer > 0.

### rpath

Controls `-C rpath`. Embeds runtime library search path in binary. Target-specific; only set when your target requires it. Default: `false` in all profiles.

Cannot be set in `[profile.*.package.*]` overrides.

## Built-in Profile Defaults

| Setting | `dev` | `release` | `test` | `bench` |
|---------|-------|-----------|--------|---------|
| `opt-level` | `0` | `3` | `0` (from dev) | `3` (from release) |
| `debug` | `true` (2) | `false` (0) | `true` | `false` |
| `split-debuginfo` | rustc target default; macOS `"unpacked"` | rustc target default | as `dev` | as `release` |
| `strip` | `"none"` | `"none"` | `"none"` | `"none"` |
| `debug-assertions` | `true` | `false` | `true` | `false` |
| `overflow-checks` | `true` | `false` | `true` | `false` |
| `lto` | `false` | `false` | `false` | `false` |
| `panic` | `"unwind"` | `"unwind"` | `"unwind"` | `"unwind"` |
| `incremental` | `true` | `false` | `true` | `false` |
| `codegen-units` | `256` | `16` | `256` | `16` |
| `rpath` | `false` | `false` | `false` | `false` |

`test` inherits from `dev`; `bench` inherits from `release`.

## Custom Profiles

Require `inherits` pointing to an existing profile. Output goes to `target/<profile-name>/`.

```toml
[profile.release-lto]
inherits = "release"
lto = "fat"

[profile.dev-opt]
inherits = "dev"
opt-level = 1
```

```sh
cargo build --profile release-lto
```

## Profile Selection by Command

| Command / flag | Profile used |
|----------------|-------------|
| `cargo build`, `cargo run`, `cargo check`, `cargo rustc` | `dev` |
| `cargo build --release` / `--profile release` | `release` |
| `cargo test` | `test` |
| `cargo bench` | `bench` |
| `cargo install` | `release` |
| `cargo install --debug` | `debug` (built in, inherits `dev`, shares `target/debug/`) |
| `--profile NAME` | custom/named |

Selected profile applies to all targets (lib, bin, example, test, bench).

## Per-Package Overrides

Override settings for specific packages in a profile. Cannot override `panic`, `lto`, or `rpath`.

```toml
# Specific package (by name)
[profile.dev.package.nalgebra]
opt-level = 3

# Specific package + version
[profile.dev.package."foo:2.1.0"]
opt-level = 2

# All non-workspace dependencies
[profile.dev.package."*"]
opt-level = 2
```

### Build Override (Build Scripts + Proc Macros)

Build scripts and proc macros default to `opt-level = 0` in all profiles for fast compilation.

```toml
[profile.dev.build-override]
opt-level = 3            # they run faster but compile slower
codegen-units = 1
```

Implicit default `build-override` in `dev` and `release`: `opt-level = 0`, `codegen-units = 256`.

Warning: a crate used as both a normal dep and a build dep may compile twice when `build-override` is set.

### Override Precedence (First Match Wins)

1. `[profile.NAME.package."exact-name"]`
2. `[profile.NAME.package."*"]`
3. `[profile.NAME.build-override]` (build scripts/proc macros only)
4. `[profile.NAME]`
5. Cargo built-in defaults

### Generics Caveat

Generic functions instantiate in the crate that uses them. Raising `opt-level` on a dep won't improve how those monomorphized generics compile in your crate. Use `opt-level = 1` on all deps (`[profile.dev.package."*"]`) for a practical dev speedup without losing monomorphization sharing.

## Cheat-Sheet

The max-speed, min-size and balanced release templates are in `SKILL.md`. Adding `debug-assertions = false`, `overflow-checks = false` or `incremental = false` to them only restates release defaults.

### Fast Compile / Iteration

```toml
[profile.dev]
opt-level = 0
debug = "line-tables-only"  # Rust 1.71+: faster, still usable backtraces
incremental = true
codegen-units = 256

[profile.dev.package."*"]
opt-level = 1           # deps get light passes; helps generics perf
debug = false           # no debuginfo for deps

[profile.dev.build-override]
opt-level = 3           # build scripts + proc macros run faster; they take longer to compile

[profile.debugging]     # opt-in full debuginfo: cargo build --profile debugging
inherits = "dev"
debug = true
```

Cranelift (nightly, dev only): `[unstable] codegen-backend = true` + `[profile.dev] codegen-backend = "cranelift"` in `.cargo/config.toml`.

## Checklist

Run over your own diff:

- [ ] Every `[profile.*]` table is in the workspace-root `Cargo.toml`.
- [ ] Every custom profile has `inherits`.
- [ ] No `lto`, `panic` or `rpath` in a `[profile.*.package.*]` override.
- [ ] Line tables are written `debug = "line-tables-only"`, not `debug = 1`; no `debug = 0` to speed up dev builds.
- [ ] `strip = "symbols"` only where nothing needs a readable backtrace.
- [ ] `panic = "abort"` only where nothing needs to unwind.
- [ ] `opt-level = "s"`/`"z"` and `lto = "fat"` come from a measurement.
- [ ] No `incremental = true` in a release profile.
