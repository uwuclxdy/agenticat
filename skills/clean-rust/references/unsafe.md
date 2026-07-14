# Unsafe

Default posture stays `unsafe_code = "forbid"` (crate-level) until a concrete need exists: FFI, a proven-hot SIMD path, an OS API without a safe wrapper. "The borrow checker rejected my design" is never the need — that's a design problem with a safe solution.

## Two Comments, Two Audiences

Every piece of unsafe code carries both:

1. **`# Safety` doc section on an `unsafe fn`** — the *caller's* obligations: what must hold for any call to be sound.
2. **`// SAFETY:` comment above each `unsafe {}` block** — the *auditor's* justification: why this specific operation upholds the invariants here.

```rust
/// Returns the byte at `ptr + offset`.
///
/// # Safety
///
/// - `ptr` must be valid for reads for at least `offset + 1` bytes.
/// - The memory must not be mutated for the duration of the call.
pub unsafe fn read_at(ptr: *const u8, offset: usize) -> u8 {
    // SAFETY: caller guarantees ptr is valid for offset + 1 bytes,
    // so ptr.add(offset) is in bounds and dereferenceable.
    unsafe { *ptr.add(offset) }
}
```

Omitting either leaves someone unable to verify soundness. Enforce mechanically with `#![warn(clippy::undocumented_unsafe_blocks)]`.

## Minimal Blocks Inside Safe Wrappers

- One operation per `unsafe {}` where practical; a block spanning five operations gets one vague SAFETY comment instead of five checkable ones.
- Don't mark a whole function `unsafe` when one line needs it — wrap the line, keep the function safe, and let the wrapper's checks (bounds, null, alignment) justify the block.
- Under edition 2024, `unsafe_op_in_unsafe_fn` warns by default: even inside an `unsafe fn`, operations need their own explicit `unsafe {}` blocks (each with its SAFETY comment).

## Exported Symbols Are Unsafe Now

Edition 2024 reclassifies the linker-facing attributes because they can cause UB with no compiler diagnostic: two items exporting the same symbol name make the linker silently pick one, and the survivor may have a different signature entirely.

| Edition ≤2021 | Edition 2024 |
|---|---|
| `#[no_mangle]` | `#[unsafe(no_mangle)]` |
| `#[export_name = "sym"]` | `#[unsafe(export_name = "sym")]` |
| `#[link_section = ".sec"]` | `#[unsafe(link_section = ".sec")]` |

The wrapper needs no `unsafe {}` block at any call site — it marks the attribute itself as load-bearing: you vouched that the symbol is unique across the final binary. Extern blocks follow suit: `unsafe extern "C" { ... }`.

## Verify with Miri

Unsafe-heavy code gets `cargo +nightly miri test` in CI. Miri catches UB (out-of-bounds, use-after-free, aliasing violations) that passes tests natively — a green test suite is not evidence of soundness. For lock-free data structures, add `loom` (see `concurrency.md`).

## `MaybeUninit`, Not Zeroed Guesses

Uninitialized memory is `MaybeUninit<T>`, never `mem::zeroed()` for types where zero isn't a valid bit pattern (references, `NonZero*`, enums) — that's instant UB, even if the value is never read.
