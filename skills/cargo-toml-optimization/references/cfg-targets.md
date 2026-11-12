# Rust `cfg(...)` Reference: Cargo Target Configuration

Load when writing a `[target.'cfg(...)']` table in `Cargo.toml` or `.cargo/config.toml`, a `#[cfg(...)]` on a target property, or picking a target triple.
The value lists are examples: run `rustc --print cfg --target <triple>` for the exact set on any given target.

> _Captured 2026-07-10 (Rust/Cargo stable), audited against the Rust/Cargo 1.99 docs. To update: re-fetch the source URL(s) below, then diff for changes._

Sources: https://doc.rust-lang.org/reference/conditional-compilation.html | https://doc.rust-lang.org/rustc/platform-support.html

## cfg Keys and Values

### `target_arch`

| value | description |
|---|---|
| `"x86"` | 32-bit x86 |
| `"x86_64"` | 64-bit x86 |
| `"arm"` | 32-bit ARM (v6/v7) |
| `"aarch64"` | 64-bit ARM (ARMv8+) |
| `"mips"` | 32-bit MIPS |
| `"mips64"` | 64-bit MIPS |
| `"powerpc"` | 32-bit PowerPC |
| `"powerpc64"` | 64-bit PowerPC |
| `"riscv32"` | 32-bit RISC-V |
| `"riscv64"` | 64-bit RISC-V |
| `"s390x"` | IBM Z (s390x) |
| `"sparc"` | 32-bit SPARC |
| `"sparc64"` | 64-bit SPARC |
| `"wasm32"` | WebAssembly 32-bit |
| `"wasm64"` | WebAssembly 64-bit (experimental) |
| `"loongarch64"` | LoongArch 64-bit |
| `"m68k"` | Motorola 68000 |
| `"nvptx64"` | NVIDIA PTX 64-bit |
| `"hexagon"` | Qualcomm Hexagon DSP |
| `"bpf"` | eBPF |
| `"csky"` | C-SKY |

### `target_os`

| value | description |
|---|---|
| `"linux"` | Linux |
| `"windows"` | Windows |
| `"macos"` | macOS |
| `"ios"` | iOS |
| `"tvos"` | tvOS |
| `"watchos"` | watchOS |
| `"visionos"` | visionOS (Apple Vision Pro) |
| `"android"` | Android |
| `"freebsd"` | FreeBSD |
| `"dragonfly"` | DragonFly BSD |
| `"openbsd"` | OpenBSD |
| `"netbsd"` | NetBSD |
| `"solaris"` | Solaris |
| `"illumos"` | illumos |
| `"fuchsia"` | Google Fuchsia |
| `"redox"` | Redox OS |
| `"haiku"` | Haiku OS |
| `"wasi"` | WebAssembly WASI (Preview 1 and 2) |
| `"emscripten"` | Emscripten JS target |
| `"hermit"` | HermitCore unikernel |
| `"uefi"` | UEFI firmware |
| `"nto"` | QNX Neutrino |
| `"espidf"` | Espressif ESP-IDF (FreeRTOS) |
| `"vita"` | PlayStation Vita |
| `"hurd"` | GNU Hurd |
| `"cuda"` | NVIDIA CUDA |
| `"xous"` | Xous (Precursor device OS) |
| `"none"` | Bare-metal / no OS |
| `"unknown"` | `wasm32-unknown-unknown`, SGX |

### `target_family`

Broad family grouping. A single target may belong to multiple families simultaneously (e.g., both `"unix"` and `"wasm"`).

| value | description |
|---|---|
| `"unix"` | UNIX-like (Linux, macOS, BSD, etc.) |
| `"windows"` | Windows |
| `"wasm"` | WebAssembly |

**Bare-flag aliases** (standalone boolean cfg keys, not key=value):

| cfg | equivalent to |
|---|---|
| `unix` | `target_family = "unix"` |
| `windows` | `target_family = "windows"` |

Usage in Cargo:
```toml
[target.'cfg(unix)'.dependencies]
libc = "0.2"
```

### `target_env`

Disambiguates the ABI or C library. Empty string when no disambiguation is needed (e.g., macOS, bare-metal).

| value | typical context |
|---|---|
| `""` | Apple targets, WASM, bare-metal |
| `"gnu"` | glibc-based Linux, MinGW Windows |
| `"musl"` | musl libc Linux |
| `"msvc"` | Microsoft Visual C++ runtime |
| `"sgx"` | Intel SGX enclaves (Fortanix) |
| `"sim"` | iOS/tvOS/watchOS simulator (1.91+; earlier: `target_abi`) |
| `"macabi"` | Mac Catalyst: iOS APIs on macOS (1.91+; earlier: `target_abi`) |
| `"ohos"` | OpenHarmony OS |
| `"newlib"` | Newlib C library (embedded) |
| `"uclibc"` | uClibc (embedded Linux) |
| `"relibc"` | Redox relibc |
| `"kernel"` | Linux kernel module targets |
| `"gnullvm"` | MinGW with LLVM ABI (gnullvm) |
| `"p1"` / `"p2"` | WASI Preview 1 (`wasm32-wasip1`, `-threads`) / Preview 2 (`wasm32-wasip2`); `p1`: 1.80+ |

An embedded-ABI triple such as `gnueabihf` sets `target_env = "gnu"`, never `"gnueabihf"`.

### `target_abi`

Further ABI disambiguation inside `target_env`. Stabilized in Rust 1.78.0 (unstable `cfg_target_abi` feature gate since ~1.51).

| value | description |
|---|---|
| `""` | Default / unspecified |
| `"eabi"` | ARM Embedded ABI (soft-float) |
| `"eabihf"` | ARM Embedded ABI, hardware float |
| `"abi64"` | MIPS N64 ABI |
| `"llvm"` | LLVM-specific ABI |
| `"softfloat"` | Software float ABI |
| `"hardfloat"` | Hardware float ABI |
| `"gnullvm"` | GNU with LLVM ABI |

### `target_endian`

| value | description |
|---|---|
| `"little"` | Little-endian (x86, ARM, RISC-V, WASM) |
| `"big"` | Big-endian (MIPS (some), PowerPC, s390x, SPARC) |

### `target_pointer_width`

| value | typical targets |
|---|---|
| `"16"` | MSP430, AVR (rare) |
| `"32"` | x86, arm, wasm32, riscv32, MIPS32 |
| `"64"` | x86_64, aarch64, wasm64, riscv64 |

### `target_vendor`

| value | description |
|---|---|
| `"unknown"` | Generic / community targets |
| `"pc"` | Standard PC (Windows x86/x64) |
| `"apple"` | Apple targets (macOS, iOS, etc.) |
| `"fortanix"` | Fortanix SGX targets |
| `"nvidia"` | NVIDIA CUDA targets |
| `"sony"` | PlayStation Vita |
| `"nintendo"` | Nintendo Switch (Horizon OS) |
| `"espressif"` | Espressif (ESP32/ESP-IDF) |
| `"mti"` | MIPS Technologies |
| `"sun"` | Oracle/Sun Solaris |
| `"uwp"` | Windows UWP targets |

### `target_feature`

Target features that can be enabled at compile time; the list below covers common ones. Run `rustc --print target-features --target <triple>` for the full list on any given toolchain.

**x86 / x86_64:**

| feature | description |
|---|---|
| `"sse"` | Streaming SIMD Extensions |
| `"sse2"` | SSE2 (baseline for x86_64) |
| `"sse3"` | SSE3 |
| `"ssse3"` | Supplemental SSE3 |
| `"sse4.1"` | SSE 4.1 |
| `"sse4.2"` | SSE 4.2 (includes POPCNT) |
| `"avx"` | Advanced Vector Extensions |
| `"avx2"` | AVX2 |
| `"avx512f"` | AVX-512 Foundation |
| `"avx512bw"` | AVX-512 Byte/Word |
| `"avx512cd"` | AVX-512 Conflict Detection |
| `"avx512dq"` | AVX-512 Doubleword/Quadword |
| `"avx512vl"` | AVX-512 Vector Length |
| `"bmi1"` | Bit Manipulation 1 |
| `"bmi2"` | Bit Manipulation 2 |
| `"fma"` | Fused Multiply-Add |
| `"popcnt"` | POPCNT instruction |
| `"aes"` | AES-NI |
| `"pclmulqdq"` | Carry-less multiply |
| `"rdrand"` | RDRAND (hardware RNG) |
| `"rdseed"` | RDSEED |
| `"f16c"` | 16-bit float conversions |
| `"xsave"` | XSAVE |
| `"xsaveopt"` | XSAVEOPT |
| `"sha"` | SHA extensions |

**ARM / AArch64:**

| feature | description |
|---|---|
| `"neon"` | NEON SIMD (ARM Advanced SIMD, 128-bit fixed-width vectors) |
| `"sve"` | AArch64 SIMD with variable-width vector registers (128 to 2048 bits) |
| `"sve2"` | SVE2: extends SVE with more integer ops (AArch64) |
| `"v7"` | ARMv7 baseline |
| `"v8"` | ARMv8 baseline |
| `"aes"` | AES crypto extension |
| `"sha2"` | SHA-256 extension |
| `"sha3"` | SHA-512 / SHA3 extension |
| `"dotprod"` | Dot product extension |
| `"fp"` | Floating-point |
| `"fp16"` | 16-bit float |
| `"lse"` | Large System Extensions (atomics) |
| `"rcpc"` | Release Consistency via PC |

**WASM:**

| feature | description |
|---|---|
| `"simd128"` | 128-bit SIMD |
| `"atomics"` | Shared memory atomics (nightly-only cfg) |
| `"bulk-memory"` | Bulk memory operations |
| `"multivalue"` | Multi-value returns |
| `"mutable-globals"` | Mutable globals |
| `"nontrapping-fptoint"` | Non-trapping float-to-int |
| `"sign-ext"` | Sign extension |
| `"reference-types"` | Reference types |

**Cross-target / special:**

| feature | description |
|---|---|
| `"crt-static"` | Links the C runtime statically into the binary. Set/unset via `-C target-feature=+crt-static`. Common for musl and MSVC static builds. |

### `target_has_atomic`

Bit widths with hardware atomic load/store and compare-and-swap instructions.

| value | meaning |
|---|---|
| `"8"` | Atomic u8/i8 |
| `"16"` | Atomic u16/i16 |
| `"32"` | Atomic u32/i32 |
| `"64"` | Atomic u64/i64 |
| `"128"` | Atomic u128/i128 (nightly-only std) |
| `"ptr"` | Atomic pointer-width ops (AtomicUsize, AtomicPtr) |

Usage: `#[cfg(target_has_atomic = "64")]` or in Cargo:
```toml
[target.'cfg(target_has_atomic = "ptr")'.dependencies]
```

`target_has_atomic_primitive_alignment` (1.97+), same widths: the atomic type is aligned like its integer type.

### `panic`

| value | description |
|---|---|
| `"unwind"` | Default: panics unwind the stack, allowing `catch_unwind` |
| `"abort"` | Panics immediately kill the binary; no unwinding |

Set via `Cargo.toml` profile: `panic = "abort"` or `-C panic=abort` rustc flag.

### `test`

Boolean (no value). Set when compiled with `cargo test` or `rustc --test`. Use `#[cfg(test)]` for test-only code.

### `debug_assertions`

Boolean (no value). Enabled by default in debug builds (`opt-level = 0`). Disabled in release builds. Controls `debug_assert!`, `debug_assert_eq!`, `debug_assert_ne!`. Can be forced with `-C debug-assertions=yes/no`.

### `proc_macro`

Boolean (no value). Set when the current crate is being compiled as a `proc-macro` crate type.

### `feature`

Convention used by Cargo for optional dependencies and compile-time feature flags. Values are user-defined strings from `[features]` in `Cargo.toml`.

```toml
[features]
serde = ["dep:serde"]
async = ["tokio"]
```

Usage in code: `#[cfg(feature = "serde")]`

Usage in Cargo deps: `[target.'cfg(feature = "serde")'.dependencies]` is **not supported**: Cargo warns "Found `feature = ...` in `target.'cfg(...)'.dependencies`. This key is not supported for selecting dependencies and will not work as expected," and the entry never matches. `cfg(test)`, `cfg(debug_assertions)` and `cfg(proc_macro)` fail the same way. Use an optional dependency plus `[features]`:

```toml
# wrong: never matches
[target.'cfg(feature = "fancy-feature")'.dependencies]
foo = "1.0"

# right
[dependencies]
foo = { version = "1.0", optional = true }

[features]
fancy-feature = ["dep:foo"]
```

### Custom `cfg` Names

A cfg name rustc does not expect triggers the `unexpected_cfgs` lint. Declare it from `build.rs` with `cargo::rustc-check-cfg=cfg(has_foo)` (Cargo 1.80+), or statically:

```toml
[lints.rust]
unexpected_cfgs = { level = "warn", check-cfg = ['cfg(has_foo)'] }
```

Cargo declares every `[features]` cfg itself: never re-declare those.

## cfg Expression Operators

Combine predicates with `all(...)` (AND), `any(...)` (OR), `not(...)` (NOT, exactly one arg); nestable. Work in `#[cfg(...)]`, `cfg!(...)`, `#[cfg_attr(...)]` and Cargo's `[target.'cfg(...)']` table keys.

**Cargo table usage:**

```toml
# Single predicate
[target.'cfg(unix)'.dependencies]
libc = "0.2"

# Compound predicate
[target.'cfg(all(target_os = "linux", target_arch = "x86_64"))'.dependencies]
some-linux-x86-crate = "1.0"

# NOT example
[target.'cfg(not(windows))'.dependencies]
unix-only = "0.1"

# any() example
[target.'cfg(any(target_os = "macos", target_os = "ios"))'.dependencies]
apple-crate = "0.1"
```

Rules for `[target]` tables:

- Gate on target properties only. `feature`, `test`, `debug_assertions`, `proc_macro` and build-script cfgs never match in a `[target.'cfg(...)']` table (`Cargo.toml` or `.cargo/config.toml`): the entry never applies.
- An exact triple works too: `[target.<triple>.dependencies]`.
- `[target.'cfg(...)'.build-dependencies]` matches the HOST platform; `dependencies` match the target.
- In `build.rs`, read `CARGO_CFG_TARGET_OS` and friends: `cfg!` there describes the host (`how-cargo-works.md`).

**In `.cargo/config.toml`:**

```toml
[target.'cfg(all(target_arch = "arm", target_os = "none"))']
linker = "arm-none-eabi-gcc"
runner = "qemu-system-arm"
rustflags = ["-C", "target-cpu=cortex-m4"]
```

## Common Target Triples

Triple format: `<arch><sub>-<vendor>-<sys>-<abi>` (`sub` is the sub-architecture, e.g. `v7` in `armv7`); parts may be omitted.

### Tier 1: Guaranteed to Work (Full std, Tested on Every PR)

| triple | arch | os | env | notes |
|---|---|---|---|---|
| `x86_64-unknown-linux-gnu` | x86_64 | linux | gnu | kernel 3.2+, glibc 2.17+ |
| `aarch64-unknown-linux-gnu` | aarch64 | linux | gnu | kernel 4.1+, glibc 2.17+ |
| `i686-unknown-linux-gnu` | x86 | linux | gnu | kernel 3.2+, glibc 2.17+, Pentium 4 |
| `x86_64-pc-windows-msvc` | x86_64 | windows | msvc | Windows 10+, MSVC runtime |
| `x86_64-pc-windows-gnu` | x86_64 | windows | gnu | Windows 10+, MinGW |
| `i686-pc-windows-msvc` | x86 | windows | msvc | Windows 10+, Pentium 4 |
| `aarch64-pc-windows-msvc` | aarch64 | windows | msvc | ARM64 Windows |
| `aarch64-apple-darwin` | aarch64 | macos | | Apple Silicon, macOS 11+ |

### Tier 2 with Host Tools: Guaranteed to Build, Binary Releases Available

| triple | arch | os | env | notes |
|---|---|---|---|---|
| `x86_64-apple-darwin` | x86_64 | macos | | Intel Mac, macOS 10.12+ |
| `x86_64-unknown-linux-musl` | x86_64 | linux | musl | musl 1.2.5, fully static |
| `aarch64-unknown-linux-musl` | aarch64 | linux | musl | musl 1.2.5 |
| `x86_64-unknown-freebsd` | x86_64 | freebsd | | |
| `armv7-unknown-linux-gnueabihf` | arm | linux | gnu | ARMv7 hardfloat, glibc |
| `riscv64gc-unknown-linux-gnu` | riscv64 | linux | gnu | kernel 4.20+, glibc 2.29 |
| `powerpc64le-unknown-linux-gnu` | powerpc64 | linux | gnu | POWER8+ little-endian |
| `powerpc64-unknown-linux-gnu` | powerpc64 | linux | gnu | big-endian |
| `s390x-unknown-linux-gnu` | s390x | linux | gnu | IBM Z, kernel 3.2+ |
| `i686-pc-windows-gnu` | x86 | windows | gnu | MinGW 32-bit |
| `x86_64-pc-windows-gnullvm` | x86_64 | windows | gnullvm | MinGW + LLVM ABI |
| `aarch64-pc-windows-gnullvm` | aarch64 | windows | gnullvm | ARM64 MinGW + LLVM |
| `riscv64gc-unknown-linux-musl` | riscv64 | linux | musl | musl 1.2.5 |
| `loongarch64-unknown-linux-gnu` | loongarch64 | linux | gnu | LoongArch 64 |
| `x86_64-unknown-illumos` | x86_64 | illumos | | illumos |
| `x86_64-unknown-netbsd` | x86_64 | netbsd | | NetBSD |
| `x86_64-pc-solaris` | x86_64 | solaris | | Solaris 11.4 |

Also in this tier: `aarch64-unknown-freebsd`, `sparcv9-sun-solaris`, `*-unknown-linux-ohos` (aarch64, armv7, x86_64), `*-unknown-linux-musl` (loongarch64, powerpc64, powerpc64le).

### Tier 2 Without Host Tools: Limited Testing

No `std` on the bare-metal rows (`*-none*`) and `nvptx64-nvidia-cuda`: `no_std` only.

| triple | arch | os | env | notes |
|---|---|---|---|---|
| `aarch64-apple-ios` | aarch64 | ios | | iOS device |
| `aarch64-apple-ios-sim` | aarch64 | ios | sim | iOS simulator on Apple Silicon |
| `x86_64-apple-ios` | x86_64 | ios | | iOS simulator on Intel |
| `aarch64-apple-tvos` | aarch64 | tvos | | tvOS device |
| `aarch64-apple-watchos` | aarch64 | watchos | | watchOS device |
| `aarch64-linux-android` | aarch64 | android | | Android NDK |
| `armv7-linux-androideabi` | arm | android | | Android ARMv7 |
| `i686-linux-android` | x86 | android | | Android x86 (emulator) |
| `x86_64-linux-android` | x86_64 | android | | Android x86_64 (emulator) |
| `aarch64-unknown-none` | aarch64 | none | | Bare-metal AArch64, hardfloat |
| `x86_64-unknown-none` | x86_64 | none | | Bare-metal x86_64, softfloat |
| `riscv32imac-unknown-none-elf` | riscv32 | none | | Bare-metal RISC-V 32 |
| `aarch64-unknown-fuchsia` | aarch64 | fuchsia | | Google Fuchsia |
| `x86_64-unknown-fuchsia` | x86_64 | fuchsia | | Google Fuchsia |
| `x86_64-fortanix-unknown-sgx` | x86_64 | unknown | sgx | Intel SGX enclaves |
| `wasm32-unknown-unknown` | wasm32 | unknown | | Browser/JS WASM, no OS |
| `wasm32-wasip1` | wasm32 | wasi | p1 | WASI Preview 1 (was wasm32-wasi) |
| `wasm32-wasip2` | wasm32 | wasi | p2 | WASI Preview 2 (component model) |
| `thumbv6m-none-eabi` | arm | none | | Cortex-M0/M0+ (no_std only) |
| `thumbv7m-none-eabi` | arm | none | | Cortex-M3 (no_std only) |
| `thumbv7em-none-eabi` | arm | none | | Cortex-M4/M7, no FPU |
| `thumbv7em-none-eabihf` | arm | none | | Cortex-M4F/M7F, hardware FPU |
| `thumbv8m.base-none-eabi` | arm | none | | Cortex-M23 |
| `thumbv8m.main-none-eabi` | arm | none | | Cortex-M33 |
| `thumbv8m.main-none-eabihf` | arm | none | | Cortex-M33 with FPU |
| `riscv32i-unknown-none-elf` | riscv32 | none | | Bare RV32I |
| `riscv32im-unknown-none-elf` | riscv32 | none | | Bare RV32IM |
| `riscv32imafc-unknown-none-elf` | riscv32 | none | | Bare RV32IMAFC |
| `riscv64gc-unknown-none-elf` | riscv64 | none | | Bare RV64IMAFDC |
| `armv7a-none-eabi` | arm | none | | Cortex-A bare-metal |
| `armv7a-none-eabihf` | arm | none | | Cortex-A bare-metal, hardfloat |
| `x86_64-unknown-redox` | x86_64 | redox | relibc | Redox OS |
| `nvptx64-nvidia-cuda` | nvptx64 | cuda | | NVIDIA CUDA GPU (no_std) |

Also in this tier: `wasm32-wasip1-threads` (env `p1`), `wasm32-unknown-emscripten`, Mac Catalyst (`*-apple-ios-macabi`), visionOS (`aarch64-apple-visionos`, `-sim`), `arm64ec-pc-windows-msvc`.

### Tier 3 Notable: Not Built or Tested by the Rust Project

| triple | arch | os | env | notes |
|---|---|---|---|---|
| `xtensa-esp32-none-elf` | xtensa | none | | ESP32 (requires esp-rs toolchain) |
| `xtensa-esp32s3-none-elf` | xtensa | none | | ESP32-S3 |
| `riscv32imc-esp-espidf` | riscv32 | espidf | newlib | ESP32-C2/C3 with ESP-IDF (ESP32-C6: `riscv32imac-esp-espidf`) |
| `aarch64-unknown-redox` | aarch64 | redox | relibc | Redox OS |
| `mips-unknown-linux-gnu` | mips | linux | gnu | Big-endian MIPS32 |
| `mipsel-unknown-linux-gnu` | mips | linux | gnu | Little-endian MIPS32 |
| `mips64-unknown-linux-gnuabi64` | mips64 | linux | gnu | MIPS64 N64 ABI |
| `x86_64-unknown-openbsd` | x86_64 | openbsd | | OpenBSD |
| `x86_64-unknown-dragonfly` | x86_64 | dragonfly | | DragonFly BSD |

## Listing Them Yourself

```bash
# All known target triples
rustc --print target-list

# cfg keys and values rustc would set for a given target
rustc --print cfg
rustc --print cfg --target aarch64-unknown-linux-gnu

# Available CPU variants for a target
rustc --print target-cpus --target x86_64-unknown-linux-gnu

# All target features for a target (with + enabled, - disabled defaults)
rustc --print target-features --target x86_64-unknown-linux-gnu

# Check what cfg a specific target+feature combo reports
rustc --print cfg --target x86_64-unknown-linux-gnu -C target-feature=+avx2
```

These commands reflect the exact rustc version installed, making them the canonical source of truth for any given toolchain.

## Checklist

- [ ] `[target.'cfg(...)']` keys use target properties only: no `feature`, `test`, `debug_assertions`.
- [ ] Each cfg value was confirmed with `rustc --print cfg --target <triple>`.
- [ ] A custom cfg is declared (`rustc-check-cfg` or `[lints.rust] unexpected_cfgs`).
- [ ] The triple's tier was checked; bare-metal triples are `no_std`.
- [ ] `build.rs` branches on `CARGO_CFG_*`, not `cfg!`.
