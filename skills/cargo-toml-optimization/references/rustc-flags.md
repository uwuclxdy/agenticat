# rustc Codegen Options (`-C` Flags) Reference

Load when a build needs a `-C` flag no profile key covers, or when setting `rustflags`, `target-cpu`, `target-feature` or PGO.
Prefer a `[profile.*]` key wherever the table names one; reach for `rustflags` only for the rest.

> _Captured 2026-06-28 (Rust/Cargo stable). To update: re-fetch the source URL(s) below, then diff for changes._

> Source: https://doc.rust-lang.org/rustc/codegen-options/index.html

## Codegen Options

Every `-C` flag accepted by rustc. "Cargo field" column: named `[profile.*]` key where one exists; otherwise `rustflags` via `.cargo/config.toml` or `RUSTFLAGS`.

| flag | values | what it does | how to set from Cargo |
|------|--------|--------------|----------------------|
| `opt-level` | `0` `1` `2` `3` `s` `z` | Codegen pass depth. `0`=none (rustc default), `1`=basic, `2`=some optimizations, `3`=all passes (Cargo `release` default; `rustc -O` means `3`, not `2`), `s`=size, `z`=aggressive size (often larger than `s`) | `[profile.*] opt-level = 3` |
| `lto` | `fat`/`true` (default when enabled), `thin`, `false` | LTO mode. `fat`=full cross-crate, `thin`=parallel incremental LTO: similar gains, substantially less link time, can beat `fat` on large projects. rustc `false`=off; Cargo's `lto = false`=thin-local | `[profile.*] lto = "thin"` |
| `codegen-units` | integer ≥ 1 | Parallel LLVM codegen shards. Lower = fewer units, more inlining/merging, slower compile. Default: 16 (non-incremental), 256 (incremental) | `[profile.*] codegen-units = 1` |
| `panic` | `abort`, `unwind`, `immediate-abort` (nightly-only) | Panic mode. `abort` skips unwinder, smaller binary; if any crate uses it, the final binary must too. `immediate-abort` traps immediately without a panic hook and every crate must use it; nightly-only in Cargo (`cargo-features = ["panic-immediate-abort"]`) | `[profile.*] panic = "abort"` |
| `debuginfo` | `0`/`none`, `line-directives-only`, `line-tables-only`, `1`/`limited`, `2`/`full` | Debug info verbosity. `2` = full debug info (DWARF, or PDB on MSVC); `line-tables-only` = minimal for profilers | `[profile.*] debug = 2` (maps 0/1/2 -> `none`/`limited`/`full`) |
| `split-debuginfo` | `off`, `packed`, `unpacked` | Where debug sections land. `packed` = separate `.pdb` (MSVC), `.dSYM` (macOS) or `.dwp` (elsewhere); `unpacked` = per-object files. rustc default: `off` on ELF and windows-gnu, `packed` on MSVC and macOS | `[profile.*] split-debuginfo = "packed"` |
| `strip` | `none`, `debuginfo`, `symbols` | Strip debug sections or all symbols from output binary. `symbols` makes backtraces unreadable | `[profile.*] strip = "symbols"` |
| `debug-assertions` | `y`/`n` | Turns on `debug_assert!` / `cfg(debug_assertions)`. On by default in dev profile; unset, rustc enables it only at `opt-level=0` | `[profile.*] debug-assertions = false` |
| `overflow-checks` | `y`/`n` | Runtime integer overflow panics. On by default in dev profile; unset, it follows `debug-assertions`, so an optimized build wraps silently. Turn it on where overflow must panic | `[profile.*] overflow-checks = true` |
| `rpath` | `y`/`n` | Bake runtime library search path into the binary (Unix only) | `[profile.*] rpath = true` |
| `incremental` | path to directory | Turn on incremental compilation; Cargo manages the path automatically. Inhibits optimizations: not for release builds | `[profile.*] incremental = true` (Cargo handles dir) |
| `embed-bitcode` | `y`/`n` | Embed LLVM bitcode in `.rlib` files. Required for LTO between crates. Cargo sets it when `lto` is configured | auto via Cargo; or `rustflags = ["-C", "embed-bitcode=no"]` to force-disable, only with LTO off: combined with `-C lto` rustc aborts at start-up |
| `target-cpu` | CPU name, `native`, `generic` | Tune and activate ISA extensions for a specific CPU. `native` = detect at compile time (not portable) | `rustflags = ["-C", "target-cpu=native"]` |
| `target-feature` | `+feat,-feat` comma-separated | Turn individual ISA features on/off independent of `target-cpu`. Unsafe: see below | `rustflags = ["-C", "target-feature=+avx2,+bmi2"]` |
| `linker` | path | Override the linker binary used for linking | `[target.<triple>] linker = "clang"` or `rustflags = ["-C", "linker=lld"]` |
| `linker-flavor` | `gcc`, `ld`, `msvc`, `em`, `wasm-ld`, `ld.lld`, `ld64.lld`, `lld-link` | Specify linker calling convention independent of binary path | `rustflags = ["-C", "linker-flavor=ld.lld"]` |
| `link-arg` | single string | Append one flag to the linker invocation. Repeatable | `rustflags = ["-C", "link-arg=-fuse-ld=lld"]` |
| `link-args` | space-separated string | Append multiple flags at once | `rustflags = ["-C", "link-args=-Wl,--as-needed -Wl,-z,now"]` |
| `link-self-contained` | `y`/`n`, or `+component`/`-component` | Use Rust-bundled CRT objects / libc instead of system copies. Fine-grained: only the `-linker` opt-out is stable, on `x86_64-unknown-linux-gnu` (`+linker` is already the default there) | `rustflags = ["-C", "link-self-contained=-linker"]` |
| `linker-plugin-lto` | `y`/`n`, or path to LTO plugin | Defer LTO to the linker (used when mixing Rust with C/C++ toolchains that accept LTO plugins) | `rustflags = ["-C", "linker-plugin-lto"]` |
| `linker-features` | `+feat`/`-feat` comma-separated | Switch linker features on/off. Stable only for `lld` on `x86_64-unknown-linux-gnu` (`-lld` opts out; `+lld` is already the default there); other features or targets are unstable | `rustflags = ["-C", "linker-features=-lld"]` |
| `relocation-model` | `static`, `pic`, `pie`, `dynamic-no-pic`, `ropi`, `rwpi`, `ropi-rwpi`, `default` | Position-independence model. `pic` needed for shared libs; `pie` for hardened executables | `rustflags = ["-C", "relocation-model=pie"]` |
| `code-model` | `tiny`, `small`, `kernel`, `medium`, `large` | Address range constraints for code/data. `small` is default on x86-64 | `rustflags = ["-C", "code-model=large"]` |
| `force-frame-pointers` | `y`/`n` | Always emit frame pointer register. Helps profilers (perf, dtrace) at slight perf cost | `rustflags = ["-C", "force-frame-pointers=yes"]` |
| `force-unwind-tables` | `y`/`n` | Force generation of unwind tables even with `panic=abort` | `rustflags = ["-C", "force-unwind-tables=yes"]` |
| `no-redzone` | `y`/`n` | Disable the 128-byte x86-64 red zone. Required for kernel code | `rustflags = ["-C", "no-redzone=yes"]` |
| `prefer-dynamic` | `y`/`n` | Link `std` as a `.so`/`.dylib` at runtime instead of bundling it statically | `rustflags = ["-C", "prefer-dynamic"]` |
| `default-linker-libraries` | `y`/`n` | Include/suppress linker's default library list | `rustflags = ["-C", "default-linker-libraries=no"]` |
| `control-flow-guard` | `checks`/`true`, `nochecks`, `false` | Windows CFG security mitigation. `nochecks` emits metadata without runtime checks: testing only, it enforces nothing | `rustflags = ["-C", "control-flow-guard=checks"]` |
| `instrument-coverage` | (no value) | Source-based code coverage instrumentation (LLVM coverage) | `rustflags = ["-C", "instrument-coverage"]` |
| `profile-generate` | path to dir (optional) | Instrument binary for PGO data collection; writes `.profraw` files at runtime | `rustflags = ["-C", "profile-generate=/tmp/pgo-data"]` |
| `profile-use` | path to `.profdata` file | Feed merged PGO profile data into the codegen pass | `rustflags = ["-C", "profile-use=/tmp/pgo-data/merged.profdata"]` |
| `symbol-mangling-version` | `v0` | Use Rust v0 symbol mangling. Default since Rust 1.97: a no-op there | `rustflags = ["-C", "symbol-mangling-version=v0"]` |
| `metadata` | space-separated strings | Extra strings mixed into symbol mangling to avoid cross-crate collisions | `rustflags = ["-C", "metadata=myhash"]` |
| `remark` | pass names or `all` | Print LLVM pass remarks (missed, applied, analysis) to stderr | `rustflags = ["-C", "remark=all"]` |
| `save-temps` | `y`/`n` | Keep intermediate `.bc`, `.o` files after compilation | `rustflags = ["-C", "save-temps"]` |
| `extra-filename` | string | Suffix appended to all output file names | managed by Cargo; rarely set manually |
| `llvm-args` | space-separated | Pass raw arguments directly to LLVM backend, e.g. `--inline-threshold=500` | `rustflags = ["-C", "llvm-args=--inline-threshold=500"]` |
| `passes` | space-separated LLVM pass names | Append extra LLVM passes after the default pipeline | `rustflags = ["-C", "passes=name-anon-globals"]` |
| `no-prepopulate-passes` | (flag) | Start with an empty LLVM pass pipeline instead of the default | `rustflags = ["-C", "no-prepopulate-passes"]` |
| `no-vectorize-loops` | (flag) | Disable loop vectorization pass | `rustflags = ["-C", "no-vectorize-loops"]` |
| `no-vectorize-slp` | (flag) | Disable SLP (superword-level parallelism) vectorization | `rustflags = ["-C", "no-vectorize-slp"]` |
| `jump-tables` | `y`/`n` | Allow/deny LLVM from emitting jump tables for match arms | `rustflags = ["-C", "jump-tables=no"]` |
| `link-dead-code` | `y`/`n` | Keep dead code in output; a historical coverage aid, not recommended | `rustflags = ["-C", "link-dead-code"]` |
| `collapse-macro-debuginfo` | `y`/`n`/`external` | Collapse debuginfo source locations inside macro expansions | `rustflags = ["-C", "collapse-macro-debuginfo=yes"]` |
| `dwarf-version` | `2` `3` `4` `5` | Force a specific DWARF version for debug sections | `rustflags = ["-C", "dwarf-version=5"]` |
| `relro-level` | `off`, `partial`, `full` | ELF RELRO hardening (relocations made read-only after startup) | `rustflags = ["-C", "relro-level=full"]` |
| `dlltool` | path | Path to `dlltool` for Windows-GNU import library generation | `rustflags = ["-C", "dlltool=/usr/bin/dlltool"]` |
| `tune-cpu` | CPU name | Schedule instructions for a specific CPU without activating its features (x86 only, unstable) | nightly only: `rustflags = ["-Z", "tune-cpu=znver4"]`; no `-C` form |
| `ar`, `no-stack-check` | (none) | Deprecated, do nothing | (none) |
| `inline-threshold` | (none) | Deprecated; use `-C llvm-args=--inline-threshold=N` | (none) |

Profile fields map to the same-named flag, except `debug` -> `-C debuginfo` (accepts `true`/`false` too). `embed-bitcode` has no profile field.

## `target-cpu` and `target-feature` in Depth

### Discovering Valid Values

`rustc --print target-cpus` lists the recognized CPU names for the current target, `rustc --print target-features` its feature flags. Both commands accept `--target <triple>` to query a cross-compile target.

### `target-cpu=native`

Detects the host CPU at compile time and activates all its supported extensions. Produces the fastest code for the build machine but the binary will SIGILL on CPUs lacking those features. Never use for distributed binaries; local dev `.cargo/config.toml` only.

### Common `target-feature` Flags

| feature | effect |
|---------|--------|
| `+avx2` | Turns on AVX2 (256-bit SIMD) |
| `+avx512f` | Turns on AVX-512 foundation |
| `+bmi1`, `+bmi2` | Bit manipulation instructions |
| `+fma` | Fused multiply-add |
| `+sse4.2` | SSE 4.2 (includes POPCNT, CRC32) |
| `+neon` | ARM NEON SIMD |
| `+crt-static` | Link the C runtime statically (Windows + musl targets) |
| `-crt-static` | Use the shared/runtime CRT (overrides target default) |

A global `target-feature=+…` is unsafe in a shipped binary: undefined behavior on a CPU without the feature. Enable it per function with `#[target_feature(enable = "avx2")]` and call it behind a runtime check with a fallback (Rust 1.27+): `if is_x86_feature_detected!("avx2") { unsafe { f() } } else { g() }`. Only a caller that itself enables `avx2` may skip the check. Or build only for CPUs you control.

`+crt-static` is the canonical way to get a fully static binary on musl targets:

```sh
RUSTFLAGS="-C target-feature=+crt-static" cargo build --target x86_64-unknown-linux-musl
```

### PGO Workflow

PGO requires two compile passes plus a profdata merge step. Pass `--target` in both passes so `RUSTFLAGS` stays off build scripts and proc macros.

**Step 1: instrument**
```sh
RUSTFLAGS="-C profile-generate=/tmp/pgo-data" cargo build --release --target x86_64-unknown-linux-gnu
```

**Step 2: run representative workloads** so the instrumented binary writes `.profraw` files to `/tmp/pgo-data/`.

**Step 3: merge profiles**
```sh
llvm-profdata merge -output=/tmp/pgo-data/merged.profdata /tmp/pgo-data/*.profraw
```

`llvm-profdata` ships with LLVM; on Linux install `llvm` or the matching rustup component: `rustup component add llvm-tools-preview` (binary lands at `$(rustc --print sysroot)/lib/rustlib/<host>/bin/llvm-profdata`).

**Step 4: final build**
```sh
RUSTFLAGS="-C profile-use=/tmp/pgo-data/merged.profdata" cargo build --release --target x86_64-unknown-linux-gnu
```

Combine with `-C lto=thin` and `-C codegen-units=1` for maximum effect.

## Setting `rustflags`

### Precedence

Four mutually exclusive sources, first match wins, no merging across tiers: `CARGO_ENCODED_RUSTFLAGS` env > `RUSTFLAGS` env > target tier (`[target.<triple>].rustflags` + matching `[target.'cfg(...)'].rustflags`, joined) > `[build].rustflags` fallback (dropped the moment any target entry applies). Full breakdown: `config.md` under `[build]`.

### Array Form in `.cargo/config.toml`

Prefer the array form to avoid shell quoting issues with values containing spaces:

```toml
[build]
rustflags = ["-C", "target-cpu=native", "-C", "opt-level=3"]

# Or scoped to a specific target triple:
[target.x86_64-unknown-linux-gnu]
rustflags = ["-C", "link-arg=-fuse-ld=lld", "-C", "force-frame-pointers=yes"]
```

Each array element reaches rustc as one argument, unsplit. Write a flag and its value as two elements (`"-C", "target-cpu=native"`) or joined without a space (`"-Ctarget-cpu=native"`), never `"-C target-cpu=native"`. A value containing spaces stays in one element.

### Cross-Compilation Caveat

`[target.<triple>].rustflags` only applies to artifacts compiled targeting that triple. Build scripts (`build.rs`) and procedural macros are host artifacts; they are compiled for the host triple regardless of `--target`.

- With `--target`: host artifacts receive no rustflags; on stable only `[target.<host-triple>] linker` reaches them.
- Without `--target`: `RUSTFLAGS` and config rustflags reach every `rustc` call, build scripts and proc macros included. Pass `--target` when a flag is meant for target code only.

`[host].rustflags` is **nightly-only** (`-Z host-config` plus `-Z target-applies-to-host`).

### `CARGO_ENCODED_RUSTFLAGS` vs `RUSTFLAGS`

Use `CARGO_ENCODED_RUSTFLAGS` in scripts when flag values may contain spaces (e.g. paths). Values are `\x1f` (unit separator, ASCII 31) delimited, no shell interpretation. Double quotes don't expand `\x1f`; use ANSI-C quoting (`$'...'`) so bash emits the real byte:

```sh
export CARGO_ENCODED_RUSTFLAGS=$'-Clink-arg=-Wl,-rpath,/opt/mylib\x1f-Ctarget-cpu=native'
```

`RUSTFLAGS` is simpler but spaces inside individual flag values will be misinterpreted as flag boundaries.

## Checklist

Run over your own diff:

- [ ] One rustflags source: no `RUSTFLAGS` env on top of config `rustflags`.
- [ ] No `target-cpu=native` and no global `target-feature=+…` in a shipped or CI build.
- [ ] `#[target_feature]` calls sit behind a runtime check.
- [ ] `--target` is passed wherever flags must stay off build scripts and proc macros.
- [ ] No `embed-bitcode=no` with LTO; no removed or nightly-only flag on stable (`soft-float`, `tune-cpu`, `[host]`).
