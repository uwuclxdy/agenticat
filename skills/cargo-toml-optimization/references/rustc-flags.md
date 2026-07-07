# rustc Codegen Options (`-C` flags) — Cargo Reference
> _Captured 2026-06-28 (Rust/Cargo stable). To update: re-fetch the source URL(s) below, then diff for changes._

## Source (for future changes)

- https://doc.rust-lang.org/rustc/codegen-options/index.html

---

## Codegen options

Every `-C` flag accepted by rustc. "Cargo field" column: named `[profile.*]` key where one exists; otherwise `rustflags` via `.cargo/config.toml` or `RUSTFLAGS`.

| flag | values | what it does | how to set from Cargo |
|------|--------|--------------|----------------------|
| `opt-level` | `0` `1` `2` `3` `s` `z` | Codegen pass depth. `0`=none, `1`=basic, `2`=default release, `3`=all passes, `s`=size, `z`=aggressive size | `[profile.*] opt-level = 3` |
| `lto` | `fat`/`true` (default when enabled), `thin`, `false` | LTO mode. `fat`=full cross-crate, `thin`=parallel incremental LTO | `[profile.*] lto = "thin"` |
| `codegen-units` | integer ≥ 1 | Parallel LLVM codegen shards. Lower = fewer units, more inlining/merging, slower compile. Default: 16 (non-incremental), 256 (incremental) | `[profile.*] codegen-units = 1` |
| `panic` | `abort`, `immediate-abort`, `unwind` | Panic mode. `abort` skips unwinder, smaller binary; `immediate-abort` traps immediately without panic hook | `[profile.*] panic = "abort"` |
| `debuginfo` | `0`/`none`, `line-directives-only`, `line-tables-only`, `1`/`limited`, `2`/`full` | Debug info verbosity. `2` = full DWARF; `line-tables-only` = minimal for profilers | `[profile.*] debug = 2` (maps 0/1/2 → `none`/`limited`/`full`) |
| `split-debuginfo` | `off`, `packed`, `unpacked` | Where debug sections land. `packed` = separate `.dSYM`/`.pdb`; `unpacked` = per-object files | `[profile.*] split-debuginfo = "packed"` |
| `strip` | `none`, `debuginfo`, `symbols` | Strip debug sections or all symbols from output binary | `[profile.*] strip = "symbols"` |
| `debug-assertions` | `y`/`n` | Turns on `debug_assert!` / `cfg(debug_assertions)`. On by default in dev profile | `[profile.*] debug-assertions = false` |
| `overflow-checks` | `y`/`n` | Runtime integer overflow panics. On by default in dev profile | `[profile.*] overflow-checks = false` |
| `rpath` | `y`/`n` | Bake runtime library search path into the binary (Unix only) | `[profile.*] rpath = true` |
| `incremental` | path to directory | Turn on incremental compilation; Cargo manages the path automatically | `[profile.*] incremental = true` (Cargo handles dir) |
| `embed-bitcode` | `y`/`n` | Embed LLVM bitcode in `.rlib` files. Required for LTO between crates. Cargo sets it when `lto` is configured | auto via Cargo; or `rustflags = ["-C", "embed-bitcode=no"]` to force-disable |
| `target-cpu` | CPU name, `native`, `generic` | Tune and activate ISA extensions for a specific CPU. `native` = detect at compile time (not portable) | `rustflags = ["-C", "target-cpu=native"]` |
| `target-feature` | `+feat,-feat` comma-separated | Turn individual ISA features on/off independent of `target-cpu` | `rustflags = ["-C", "target-feature=+avx2,+bmi2"]` |
| `linker` | path | Override the linker binary used for linking | `[target.<triple>] linker = "clang"` or `rustflags = ["-C", "linker=lld"]` |
| `linker-flavor` | `gcc`, `ld`, `msvc`, `em`, `wasm-ld`, `ld.lld`, `ld64.lld`, `lld-link` | Specify linker calling convention independent of binary path | `rustflags = ["-C", "linker-flavor=ld.lld"]` |
| `link-arg` | single string | Append one flag to the linker invocation. Repeatable | `rustflags = ["-C", "link-arg=-fuse-ld=lld"]` |
| `link-args` | space-separated string | Append multiple flags at once | `rustflags = ["-C", "link-args=-Wl,--as-needed -Wl,-z,now"]` |
| `link-self-contained` | `y`/`n`, or `+component`/`-component` | Use Rust-bundled CRT objects / libc instead of system copies. Fine-grained: `+crt-objects`, `+libc`, `+unwind`, etc. | `rustflags = ["-C", "link-self-contained=+crt-objects"]` |
| `linker-plugin-lto` | `y`/`n`, or path to LTO plugin | Defer LTO to the linker (used when mixing Rust with C/C++ toolchains that accept LTO plugins) | `rustflags = ["-C", "linker-plugin-lto"]` |
| `linker-features` | `+lld` / `-lld` | Switch linker features on/off, e.g. use the bundled LLD | `rustflags = ["-C", "linker-features=+lld"]` |
| `relocation-model` | `static`, `pic`, `pie`, `dynamic-no-pic`, `ropi`, `rwpi`, `ropi-rwpi`, `default` | Position-independence model. `pic` needed for shared libs; `pie` for hardened executables | `rustflags = ["-C", "relocation-model=pie"]` |
| `code-model` | `tiny`, `small`, `kernel`, `medium`, `large` | Address range constraints for code/data. `small` is default on x86-64 | `rustflags = ["-C", "code-model=large"]` |
| `force-frame-pointers` | `y`/`n` | Always emit frame pointer register. Helps profilers (perf, dtrace) at slight perf cost | `rustflags = ["-C", "force-frame-pointers=yes"]` |
| `force-unwind-tables` | `y`/`n` | Force generation of unwind tables even with `panic=abort` | `rustflags = ["-C", "force-unwind-tables=yes"]` |
| `no-redzone` | `y`/`n` | Disable the 128-byte x86-64 red zone. Required for kernel code | `rustflags = ["-C", "no-redzone=yes"]` |
| `soft-float` | `y`/`n` | Use software float routines instead of hardware FPU | `rustflags = ["-C", "soft-float=yes"]` |
| `prefer-dynamic` | `y`/`n` | Link `std` as a `.so`/`.dylib` at runtime instead of bundling it statically | `rustflags = ["-C", "prefer-dynamic"]` |
| `default-linker-libraries` | `y`/`n` | Include/suppress linker's default library list | `rustflags = ["-C", "default-linker-libraries=no"]` |
| `control-flow-guard` | `checks`/`true`, `nochecks`, `false` | Windows CFG security mitigation. `nochecks` emits metadata without runtime checks | `rustflags = ["-C", "control-flow-guard=checks"]` |
| `instrument-coverage` | (no value) | Source-based code coverage instrumentation (LLVM coverage) | `rustflags = ["-C", "instrument-coverage"]` |
| `profile-generate` | path to dir (optional) | Instrument binary for PGO data collection; writes `.profraw` files at runtime | `rustflags = ["-C", "profile-generate=/tmp/pgo-data"]` |
| `profile-use` | path to `.profdata` file | Feed merged PGO profile data into the codegen pass | `rustflags = ["-C", "profile-use=/tmp/pgo-data/merged.profdata"]` |
| `symbol-mangling-version` | `v0` | Use Rust v0 symbol mangling (richer, less ambiguous than legacy) | `rustflags = ["-C", "symbol-mangling-version=v0"]` |
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
| `link-dead-code` | `y`/`n` | Keep dead code in output (useful for coverage analysis) | `rustflags = ["-C", "link-dead-code"]` |
| `collapse-macro-debuginfo` | `y`/`n`/`external` | Collapse debuginfo source locations inside macro expansions | `rustflags = ["-C", "collapse-macro-debuginfo=yes"]` |
| `dwarf-version` | `2` `3` `4` `5` | Force a specific DWARF version for debug sections | `rustflags = ["-C", "dwarf-version=5"]` |
| `relro-level` | `off`, `partial`, `full` | ELF RELRO hardening (relocations made read-only after startup) | `rustflags = ["-C", "relro-level=full"]` |
| `dlltool` | path | Path to `dlltool` for Windows-GNU import library generation | `rustflags = ["-C", "dlltool=/usr/bin/dlltool"]` |
| `tune-cpu` | CPU name | Schedule instructions for a specific CPU without activating its features (x86 only, unstable) | `rustflags = ["-C", "tune-cpu=znver4"]` |
| `ar` | (none) | Deprecated, does nothing | (none) |
| `inline-threshold` | (none) | Deprecated; use `-C llvm-args=--inline-threshold=N` | (none) |
| `no-stack-check` | (none) | Deprecated, does nothing | (none) |

---

## Profile field → `-C` flag map

| `[profile.*]` field | emitted `-C` flag | notes |
|--------------------|--------------------|-------|
| `opt-level` | `-C opt-level=<N>` | accepts `0`-`3`, `"s"`, `"z"` |
| `lto` | `-C lto=<value>` | `true`/`"fat"` → fat LTO; `"thin"` → thin LTO; `false` → off |
| `codegen-units` | `-C codegen-units=<N>` | 1 forces single unit, best inlining; Cargo defaults to 16 for release |
| `panic` | `-C panic=<mode>` | `"abort"` or `"unwind"` (default) |
| `debug` | `-C debuginfo=<level>` | `0`=none, `1`=limited, `2`=full; accepts `true`/`false` too |
| `split-debuginfo` | `-C split-debuginfo=<mode>` | `"off"`, `"packed"`, `"unpacked"` |
| `strip` | `-C strip=<mode>` | `"none"`, `"debuginfo"`, `"symbols"` |
| `debug-assertions` | `-C debug-assertions=<y/n>` | on by default in `dev`, off in `release` |
| `overflow-checks` | `-C overflow-checks=<y/n>` | on by default in `dev`, off in `release` |
| `rpath` | `-C rpath=<y/n>` | off by default |
| `incremental` | `-C incremental=<path>` | Cargo computes the path; setting `incremental = true/false` enables or suppresses it |
| `embed-bitcode` | `-C embed-bitcode=<y/n>` | Cargo sets this automatically based on `lto`; manual override via `rustflags` |

---

## `target-cpu` and `target-feature` in depth

### Discovering valid values

```sh
# List all recognized CPU names for the current target
rustc --print target-cpus

# List all feature flags for the current target
rustc --print target-features
```

Both commands accept `--target <triple>` to query a cross-compile target.

### `target-cpu=native`

Detects the host CPU at compile time and activates all its supported extensions. Produces the fastest code for the build machine but the binary will SIGILL on CPUs lacking those features. Never use for distributed binaries.

```toml
# .cargo/config.toml — local dev only
[build]
rustflags = ["-C", "target-cpu=native"]
```

### Common `target-feature` flags

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

`+crt-static` is the canonical way to get a fully static binary on musl targets:

```sh
RUSTFLAGS="-C target-feature=+crt-static" cargo build --target x86_64-unknown-linux-musl
```

### PGO workflow

PGO requires two compile passes plus a profdata merge step.

**Step 1: instrument**
```sh
RUSTFLAGS="-C profile-generate=/tmp/pgo-data" cargo build --release
```

**Step 2: run representative workloads** so the instrumented binary writes `.profraw` files to `/tmp/pgo-data/`.

**Step 3: merge profiles**
```sh
llvm-profdata merge -output=/tmp/pgo-data/merged.profdata /tmp/pgo-data/*.profraw
```

`llvm-profdata` ships with LLVM; on Linux install `llvm` or the matching `llvm-tools-preview` rustup component:
```sh
rustup component add llvm-tools-preview
# binary lands at $(rustc --print sysroot)/lib/rustlib/<host>/bin/llvm-profdata
```

**Step 4: final build**
```sh
RUSTFLAGS="-C profile-use=/tmp/pgo-data/merged.profdata" cargo build --release
```

Combine with `-C lto=thin` and `-C codegen-units=1` for maximum effect.

---

## Setting `rustflags`

### Precedence (highest to lowest)

1. `CARGO_ENCODED_RUSTFLAGS` environment variable (null-separated, exact, no shell splitting)
2. `RUSTFLAGS` environment variable (space-separated, shell-split)
3. `[target.<triple>].rustflags` in `.cargo/config.toml`
4. `[target.<cfg(...)>].rustflags` in `.cargo/config.toml`
5. `[build].rustflags` in `.cargo/config.toml`

Higher entries completely override lower ones. They do not merge.

### Array form in `.cargo/config.toml`

Prefer the array form to avoid shell quoting issues with values containing spaces:

```toml
[build]
rustflags = ["-C", "target-cpu=native", "-C", "opt-level=3"]

# Or scoped to a specific target triple:
[target.x86_64-unknown-linux-gnu]
rustflags = ["-C", "link-arg=-fuse-ld=lld", "-C", "force-frame-pointers=yes"]
```

Each flag and its value must be **separate array elements** when the flag takes a value. Combining them (`"-C target-cpu=native"` as one string) works too but may break on older Cargo versions.

### Cross-compilation caveat

`[target.<triple>].rustflags` only applies to artifacts compiled targeting that triple. Build scripts (`build.rs`) and procedural macros are host artifacts; they are compiled for the host triple regardless of `--target`. To affect host build artifacts, set `[host].rustflags` (Cargo 1.70+) or use a separate `[target.<host-triple>]` block.

```toml
# Cargo 1.70+: flags for host-compiled artifacts (build scripts, proc-macros)
[host]
rustflags = ["-C", "opt-level=2"]
```

### `CARGO_ENCODED_RUSTFLAGS` vs `RUSTFLAGS`

Use `CARGO_ENCODED_RUSTFLAGS` in scripts when flag values may contain spaces (e.g. paths). Values are `\x1f` (unit separator, ASCII 31) delimited, no shell interpretation:

```sh
export CARGO_ENCODED_RUSTFLAGS="-Clink-arg=-Wl,-rpath,/opt/mylib\x1f-Ctarget-cpu=native"
```

`RUSTFLAGS` is simpler but spaces inside individual flag values will be misinterpreted as flag boundaries.
