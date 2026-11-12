# Unsafe

Load when a diff adds or touches `unsafe`, a raw pointer, `#[repr(..)]`, `transmute`, `MaybeUninit` or an `unsafe impl`.
Load it too before reaching for `unsafe` to get past the borrow checker.

Default posture stays `unsafe_code = "forbid"` in `[lints.rust]` (or `#![forbid(unsafe_code)]` at the crate root) until a concrete need exists: FFI, a proven-hot SIMD path, an OS API without a safe wrapper. "The borrow checker rejected my design" is never the need: fix the design in safe code.

No program may contain UB, `unsafe` code included: prove each operation's precondition before it runs (`i < v.len()` before `v.get_unchecked(i)`). Passing tests prove none of them.

FFI (`extern` blocks, exported symbols, C strings and buffers, ownership across the boundary): load `ffi.md` too.

## Two Comments, Two Audiences

Every piece of unsafe code carries both:

1. **`# Safety` doc section on an `unsafe fn`**: the *caller's* obligations, what must hold for any call to be sound.
2. **`// SAFETY:` comment above each `unsafe {}` block and each `unsafe impl`**: the *auditor's* justification, why this specific operation upholds the invariants here.

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

Enforce both mechanically: `clippy::undocumented_unsafe_blocks` and, for a `pub unsafe fn`, `clippy::missing_safety_doc`.

## Minimal Blocks Inside Safe Wrappers

- One operation per `unsafe {}` where practical; a five-operation block gets one vague SAFETY comment, not five checkable ones. `clippy::multiple_unsafe_ops_per_block`
- Don't mark a whole function `unsafe` when one line needs it: wrap the line, keep the function safe, and let the wrapper's checks (bounds, null, alignment) justify the block.
- When the wrapper cannot check a condition, the function is an `unsafe fn` with a `# Safety` section. A safe `pub fn` that reaches UB for some argument is unsound, whatever its docs say. `clippy::not_unsafe_ptr_arg_deref`
- Mark a function or trait `unsafe` only when misuse can cause UB, never as a warning label on a dangerous call (`delete_database`).
- Under edition 2024, `unsafe_op_in_unsafe_fn` warns by default: even inside an `unsafe fn`, operations need their own `unsafe {}` blocks.
- Fields that back an unsafe invariant (`len`, `cap`, a raw pointer) stay private. Re-audit the block whenever the safe code guarding it changes.
- Call `set_len` / `assume_init` only after every write has finished: a caller's `Clone`, `Ord` or closure can panic midway. Run such user code before the unsafe mutation, or repair the torn state in a `Drop` guard.
- Soundness never depends on a destructor running: `mem::forget` is safe, and leaks skip `Drop`.
- Never let a caller's safe trait impl (`Ord`) break your invariant: a wrong `cmp` is safe to write, and your unsafe code must stay sound under it (wrong results, never UB). Defend against it, or require an `unsafe trait`.

## Aliasing and Validity

- A live `&mut T` is exclusive: only it and pointers derived from it touch its target. A write through the `&mut` invalidates every raw pointer derived from it.

```rust
let mut x = 0u32;
let m = &mut x;
let p: *mut u32 = &mut *m; // derived from `m`
// wrong: `*m = 1;` here, then `unsafe { *p = 2 }`: the write through `m` invalidated `p` (UB)
// SAFETY: `p` came from `m`, and `m` is not used again while `p` is in use.
unsafe { *p = 2 };
```

- After `let p = &raw mut x;` (1.82; `addr_of_mut!` before), write `x` only through `p` while `p` is in use: a direct write to `x` invalidates `p`.
- Reading `dest.len()` after `dest.as_mut_ptr()` (as in `copy_nonoverlapping(src.as_ptr(), dest.as_mut_ptr(), dest.len())`) is not UB: never rewrite that idiom as an aliasing fix.
- Never turn `&T` into `&mut T`, by cast or by `transmute`: always UB. Mutation behind a shared reference goes through `UnsafeCell`. `UnsafeCell` does nothing about data races: shared across threads, it needs an atomic or a `Mutex` too.

```rust
use std::cell::UnsafeCell;

struct Counter(UnsafeCell<u32>);

impl Counter {
    fn bump(&self) {
        // wrong: a plain `u32` field written through `&self.0 as *const u32 as *mut u32`
        // SAFETY: `UnsafeCell` makes `Counter` `!Sync`, and no reference into the cell escapes.
        unsafe { *self.0.get() += 1 };
    }
}
```

- Never produce an invalid value: a `bool` other than 0 or 1, an out-of-range `char`, an enum discriminant matching no variant, a null `fn` pointer, a non-UTF-8 `str`, bytes read from uninitialized memory. It is UB when produced, even if never read: write `let b = byte != 0;`, never `transmute::<u8, bool>(byte)`. A pointer cast plus `ptr::read` and a `union` field read obey the same rule as `transmute`. `invalid_value`
- `std::hint::unreachable_unchecked()` is UB when reached, and an earlier `if .. { return }` does not make the next line unreachable. Write `None => unreachable!("caller checked")`, never `None => unsafe { unreachable_unchecked() }`.
- `unwrap_unchecked()` (1.58) on `None` or `Err` is UB, not a panic: call it only after proving `Some` / `Ok`, and say how in its `// SAFETY:`.
- `transmute` needs a defined, identical layout on both sides (`#[repr(C)]`, `#[repr(transparent)]`). For two `repr(Rust)` structs, destructure one and build the other.
- Never rely on a layout `repr(Rust)` leaves unspecified (field order, padding): it passes under Miri and breaks on another compiler or target. Pin it with `#[repr(C)]`.
- Never rebuild a pointer from an integer (`p as usize as *mut T`): no provenance is guaranteed. From another allocation's address it has the wrong one: UB to dereference.
- A pointer from `v.as_ptr()` is invalid once `v` grows, and is never written through: write through `v.as_mut_ptr()`.
- A reference built from a raw pointer takes its lifetime from a real input. Never return `&'a T` where `'a` appears in no argument.
- Never `&packed.field` on a `#[repr(packed)]` struct (hard error since 1.69; a misaligned reference is UB): copy it out, `let crc = p.crc;`.
- `p.add(n)` stays inside one allocation: one past the end may be formed, never read. To leave it, `wrapping_add`, and dereference the result only once it is back inside the allocation.
- A `*const [u16]` cast to `*const [u8]` keeps the element count: half the bytes. Rebuild it: `ptr::slice_from_raw_parts(p.cast::<u8>(), len * 2)` (the multiply cannot wrap: `len` counts the `u16`s of a valid slice, which spans at most `isize::MAX` bytes).
- `slice::from_raw_parts(p, n)`: the range lies in one allocation and spans at most `isize::MAX` bytes. Check `n <= isize::MAX as usize / size_of::<T>()` (non-zero-sized `T`), never a product that can wrap.
- An offset, length or capacity computed for an unsafe operation never uses a bare `+`, `-` or `*` unless a comment proves it cannot wrap (as above): `checked_add` / `checked_sub` / `checked_mul` and handle `None`; `wrapping_add` only where wrapping is meant. The bare operator wraps where overflow checks are off (release by default), and the wrapped value passes the bounds check it should fail. `clippy::arithmetic_side_effects`

## `MaybeUninit`, Not Zeroed Guesses

Uninitialized memory is `MaybeUninit<T>`, never `mem::zeroed()` for types where zero isn't a valid bit pattern (references, `NonZero*`, enums): that's instant UB.

- Never `mem::uninitialized()` (deprecated since 1.39). A buffer that can start zeroed is `[0u8; N]` or `vec![0; n]`: no `MaybeUninit` needed.
- `assume_init` is UB unless a valid `T` was written on every path that reaches it; padding bytes need not be.
- Move a value into an uninitialized slot with `ptr.write(v)` and out with `ptr.read()`. `*ptr = v` and `buf[i] = v` drop the old value first, and it is garbage.

```rust
use std::mem::MaybeUninit;

let mut slot = MaybeUninit::<String>::uninit();
// wrong: `unsafe { *slot.as_mut_ptr() = String::new() }` drops an uninitialized `String`
slot.write(String::from("ok")); // safe (1.55); through a raw pointer: `unsafe { p.write(v) }`
// SAFETY: the slot was fully written on the line above.
let s = unsafe { slot.assume_init() };
```

- Never form a reference to uninitialized data: reach a field with `let f = &raw mut (*p).field;` (1.82; `ptr::addr_of_mut!` before; inside `unsafe {}` before 1.84), then `unsafe { f.write(v) }`.
- Shifting elements inside one buffer is `ptr::copy` (overlap allowed). `copy_nonoverlapping` on overlapping ranges is UB. Both take `(src, dst, count)`: the reverse of C's `memcpy(dst, src, n)`.

```rust
let mut v = [1u8, 2, 3, 0];
let p = v.as_mut_ptr();
// wrong: `std::ptr::copy_nonoverlapping(p, p.add(1), 3)`: the ranges overlap
// SAFETY: source `p..p+3` and destination `p+1..p+4` both lie inside `v`.
unsafe { std::ptr::copy(p, p.add(1), 3) };
```

- Raw allocation: empty is `NonNull::dangling()` with `cap: 0`, never a 0-byte `alloc`; size with `Layout::array::<T>(cap)`; on null call `handle_alloc_error(layout)`, never `panic!`; `dealloc` only when `cap != 0`, with the same layout.

## `Send`, `Sync` and Statics

- Write `unsafe impl Send` / `Sync` only for a type whose raw pointer blocked the auto impl, and bound it on the contents. Never add one to silence a `spawn` error. To opt a type out on stable, add a `PhantomData<*const ()>` field.

```rust
use std::ptr::NonNull;

struct Owned<T>(NonNull<T>);

// wrong: `unsafe impl<T> Send for Owned<T> {}` also sends an `Owned<Rc<u8>>` to another thread
// SAFETY: `Owned<T>` is the only owner of its `T`, so sending it sends the `T`.
unsafe impl<T: Send> Send for Owned<T> {}
// SAFETY: `&Owned<T>` exposes only `&T`.
unsafe impl<T: Sync> Sync for Owned<T> {}
```

- `static mut`: a reference to one is denied on edition 2024 (`static_mut_refs`). Use an `Atomic*`, `Mutex`, `OnceLock` or `LazyLock` (1.80) static; where a `static mut` is forced, go through `&raw const X` / `&raw mut X` (1.82; `addr_of!` / `addr_of_mut!` before). Every read and write of a `static mut` is `unsafe`.

## Verify with Miri

Unsafe code gets `cargo +nightly miri test` in CI (install: `rustup +nightly component add miri`). Miri catches UB (out-of-bounds, use-after-free, aliasing violations) that passes tests natively: a green test suite is not evidence of soundness. For lock-free data structures, add `loom` (see `concurrency.md`).

- Miri cannot call most foreign functions or platform APIs: mark those tests `#[cfg_attr(miri, ignore)]`, never delete them.
- A clean Miri run covers only the executions it ran: no soundness proof.
- Harden it: `MIRIFLAGS="-Zmiri-many-seeds -Zmiri-symbolic-alignment-check"`; byte-layout code also runs `--target s390x-unknown-linux-gnu` (big-endian).
- Never reach green by switching off a Miri check (`-Zmiri-disable-alignment-check`, `-Zmiri-disable-data-race-detector`, `-Zmiri-disable-stacked-borrows`, `-Zmiri-disable-validation`): each is unsound. `-Zmiri-disable-isolation` (real env vars, files, clocks) is fine. Never generate keys under Miri: its randomness is deterministic.

## Checklist

- [ ] Every `unsafe {}` and `unsafe impl` has a `// SAFETY:` comment; every `unsafe fn` has a `# Safety` section.
- [ ] No safe `pub fn` can reach UB for any argument.
- [ ] No `&T` to `&mut T`, no `mem::uninitialized`, no `transmute` between `repr(Rust)` types, no invalid `bool` / `char` / enum value.
- [ ] Every `unsafe impl Send` / `Sync` is bounded on its contents.
- [ ] The repo's gate runs Miri on the unsafe code, with no Miri check switched off.
