# Rust `cfg(...)` Reference: Cargo Target Configuration
> _Captured 2026-07-10 (Rust/Cargo stable). To update: re-fetch the source URL(s) below, then diff for changes._

> Authoritative source for `[target.'cfg(...)'.dependencies]` in `Cargo.toml`
> and `[target.'cfg(...)']` in `.cargo/config.toml`.
>
> **Note:** The Rust Reference marks most value lists as "example values."
> Run `rustc --print cfg --target <triple>` for the exact set on any given target.

---

## Source (for Future Changes)

- https://doc.rust-lang.org/reference/conditional-compilation.html
- https://doc.rust-lang.org/rustc/platform-support.html

---

## cfg Keys and Values

### `target_arch`

CPU target ISA.

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

Reference documented: x86, x86_64, mips, powerpc, powerpc64, arm, aarch64. Others are active in rustc target definitions.

---

### `target_os`

Target operating system (or `"none"` for bare-metal).

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
| `"wasi"` | WebAssembly WASI (Preview 1) |
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

Reference documented: windows, macos, ios, linux, android, freebsd, dragonfly, openbsd, netbsd, none. Others are in active rustc target specs.

---

### `target_family`

Broad family grouping. A single target may belong to multiple families simultaneously (e.g., both `"unix"` and `"wasm"` is theoretically possible).

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

---

### `target_env`

Disambiguates the ABI or C library. Empty string when no disambiguation is needed (e.g., macOS, bare-metal).

| value | typical context |
|---|---|
| `""` | Apple targets, WASM, bare-metal |
| `"gnu"` | glibc-based Linux, MinGW Windows |
| `"musl"` | musl libc Linux |
| `"msvc"` | Microsoft Visual C++ runtime |
| `"sgx"` | Intel SGX enclaves (Fortanix) |
| `"sim"` | iOS/tvOS/watchOS simulator |
| `"macabi"` | Mac Catalyst: iOS APIs on macOS |
| `"ohos"` | OpenHarmony OS |
| `"newlib"` | Newlib C library (embedded) |
| `"uclibc"` | uClibc (embedded Linux) |
| `"relibc"` | Redox relibc |
| `"kernel"` | Linux kernel module targets |
| `"gnullvm"` | MinGW with LLVM ABI (gnullvm) |

---

### `target_abi`

Further ABI disambiguation inside `target_env`. Stabilized in Rust 1.78.0 (unstable `cfg_target_abi`
feature gate since ~1.51).

| value | description |
|---|---|
| `""` | Default / unspecified |
| `"eabi"` | ARM Embedded ABI (soft-float) |
| `"eabihf"` | ARM Embedded ABI, hardware float |
| `"abi64"` | MIPS N64 ABI |
| `"llvm"` | LLVM-specific ABI |
| `"softfloat"` | Software float ABI |
| `"hardfloat"` | Hardware float ABI |
| `"sim"` | Simulator ABI (overlaps with target_env on older targets) |
| `"macabi"` | Mac Catalyst ABI |
| `"gnullvm"` | GNU with LLVM ABI |

---

### `target_endian`

CPU byte order.

| value | description |
|---|---|
| `"little"` | Little-endian (x86, ARM, RISC-V, WASM) |
| `"big"` | Big-endian (MIPS (some), PowerPC, s390x, SPARC) |

---

### `target_pointer_width`

Size of a pointer in bits.

| value | typical targets |
|---|---|
| `"16"` | MSP430, AVR (rare) |
| `"32"` | x86, arm, wasm32, riscv32, MIPS32 |
| `"64"` | x86_64, aarch64, wasm64, riscv64 |

---

### `target_vendor`

Vendor component of the target triple.

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

---

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
| `"atomics"` | Shared memory atomics |
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

---

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

---

### `panic`

How panics behave in this build.

| value | description |
|---|---|
| `"unwind"` | Default: panics unwind the stack, allowing `catch_unwind` |
| `"abort"` | Panics immediately kill the binary; no unwinding |

Set via `Cargo.toml` profile: `panic = "abort"` or `-C panic=abort` rustc flag.

---

### `test`

Boolean (no value). Set when compiled with `cargo test` or `rustc --test`. Use `#[cfg(test)]` for test-only code.

---

### `debug_assertions`

Boolean (no value). Enabled by default in debug builds (`opt-level = 0`). Disabled in release builds. Controls `debug_assert!`, `debug_assert_eq!`, `debug_assert_ne!`. Can be forced with `-C debug-assertions=yes/no`.

---

### `proc_macro`

Boolean (no value). Set when the current crate is being compiled as a `proc-macro` crate type.

---

### `feature`

Convention used by Cargo for optional dependencies and compile-time feature flags. Values are user-defined strings from `[features]` in `Cargo.toml`.

```toml
[features]
serde = ["dep:serde"]
async = ["tokio"]
```

Usage in code: `#[cfg(feature = "serde")]`

Usage in Cargo deps: `[target.'cfg(feature = "serde")'.dependencies]` is **not supported**: Cargo warns
"Found `feature = ...` in `target.'cfg(...)'.dependencies`. This key is not supported for selecting
dependencies and will not work as expected," and the entry silently never matches. Use
`[dependencies] serde = { optional = true }` + `[features]` instead.

---

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

**In `.cargo/config.toml`:**

```toml
[target.'cfg(all(target_arch = "arm", target_os = "none"))']
linker = "arm-none-eabi-gcc"
runner = "qemu-system-arm"
rustflags = ["-C", "target-cpu=cortex-m4"]
```

---

## Common Target Triples

Triple format: `<arch>-<vendor>-<os>[-<env>]`

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
| `wasm32-unknown-unknown` | wasm32 | none | | Browser/JS WASM, no OS |
| `wasm32-wasip1` | wasm32 | wasi | | WASI Preview 1 (was wasm32-wasi) |
| `wasm32-wasip2` | wasm32 | wasi | | WASI Preview 2 (component model) |

### Tier 2 Without Host Tools: std Available, Limited Testing

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
| `riscv64gc-unknown-linux-musl` | riscv64 | linux | musl | musl 1.2.5 |
| `loongarch64-unknown-linux-gnu` | loongarch64 | linux | gnu | LoongArch 64 |
| `x86_64-unknown-none` | x86_64 | none | | Bare-metal x86_64, softfloat |
| `x86_64-unknown-illumos` | x86_64 | illumos | | illumos |
| `x86_64-unknown-netbsd` | x86_64 | netbsd | | NetBSD |
| `x86_64-unknown-openbsd` | x86_64 | openbsd | | OpenBSD |
| `x86_64-unknown-dragonfly` | x86_64 | dragonfly | | DragonFly BSD |
| `x86_64-sun-solaris` | x86_64 | solaris | | Oracle Solaris |
| `x86_64-pc-solaris` | x86_64 | solaris | | |
| `riscv32imac-unknown-none-elf` | riscv32 | none | | Bare-metal RISC-V 32 |
| `aarch64-unknown-fuchsia` | aarch64 | fuchsia | | Google Fuchsia |
| `x86_64-unknown-fuchsia` | x86_64 | fuchsia | | Google Fuchsia |
| `x86_64-fortanix-unknown-sgx` | x86_64 | none | sgx | Intel SGX enclaves |

### Tier 3 Notable: Embedded / Special Purpose

| triple | arch | os | env | notes |
|---|---|---|---|---|
| `thumbv6m-none-eabi` | arm | none | eabi | Cortex-M0/M0+ (no_std only) |
| `thumbv7m-none-eabi` | arm | none | eabi | Cortex-M3 (no_std only) |
| `thumbv7em-none-eabi` | arm | none | eabi | Cortex-M4/M7, no FPU |
| `thumbv7em-none-eabihf` | arm | none | eabihf | Cortex-M4F/M7F, hardware FPU |
| `thumbv8m.base-none-eabi` | arm | none | eabi | Cortex-M23 |
| `thumbv8m.main-none-eabi` | arm | none | eabi | Cortex-M33 |
| `thumbv8m.main-none-eabihf` | arm | none | eabihf | Cortex-M33 with FPU |
| `riscv32i-unknown-none-elf` | riscv32 | none | | Bare RV32I |
| `riscv32im-unknown-none-elf` | riscv32 | none | | Bare RV32IM |
| `riscv32imac-unknown-none-elf` | riscv32 | none | | Bare RV32IMAC |
| `riscv32imafc-unknown-none-elf` | riscv32 | none | | Bare RV32IMAFC |
| `riscv64gc-unknown-none-elf` | riscv64 | none | | Bare RV64IMAFDC |
| `armv7a-none-eabi` | arm | none | eabi | Cortex-A bare-metal |
| `armv7a-none-eabihf` | arm | none | eabihf | Cortex-A bare-metal, hardfloat |
| `xtensa-esp32-none-elf` | xtensa | none | | ESP32 (requires esp-rs toolchain) |
| `xtensa-esp32s3-none-elf` | xtensa | none | | ESP32-S3 |
| `riscv32imc-esp-espidf` | riscv32 | espidf | | ESP32-C3/C6 with ESP-IDF |
| `aarch64-unknown-redox` | aarch64 | redox | relibc | Redox OS |
| `x86_64-unknown-redox` | x86_64 | redox | relibc | Redox OS |
| `mips-unknown-linux-gnu` | mips | linux | gnu | Big-endian MIPS32 |
| `mipsel-unknown-linux-gnu` | mips | linux | gnu | Little-endian MIPS32 |
| `mips64-unknown-linux-gnuabi64` | mips64 | linux | gnu | MIPS64 N64 ABI |
| `nvptx64-nvidia-cuda` | nvptx64 | cuda | | NVIDIA CUDA GPU |

---

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
rustc --print target-features --target aarch64-unknown-linux-gnu

# Check what cfg a specific target+feature combo reports
rustc --print cfg --target x86_64-unknown-linux-gnu -C target-feature=+avx2
```

These commands reflect the exact rustc version installed, making them the canonical source of truth for any given toolchain.
