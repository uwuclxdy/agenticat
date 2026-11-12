# FFI

Load when a diff adds or touches an `extern` block or `extern "C" fn`, `#[unsafe(no_mangle)]` / `export_name`, a C string or buffer, a `#[repr(C)]` type passed to C, or a callback or pointer C holds.
Load `unsafe.md` with it: its `// SAFETY:`, aliasing, validity and Miri rules hold at the boundary too.

## Exported Symbols Are Unsafe Now

Edition 2024 reclassifies the linker-facing attributes because they can cause UB with no compiler diagnostic.

| Edition ≤2021 | Edition 2024 |
|---|---|
| `#[no_mangle]` | `#[unsafe(no_mangle)]` |
| `#[export_name = "sym"]` | `#[unsafe(export_name = "sym")]` |
| `#[link_section = ".sec"]` | `#[unsafe(link_section = ".sec")]` |

The wrapper needs no `unsafe {}` block at any call site; it marks the attribute itself as load-bearing: you vouched that the symbol is unique in the final binary (`no_mangle`, `export_name`) or that the section can hold the item (`link_section`). Extern blocks follow suit: `unsafe extern "C" { ... }`. Both forms: accepted from 1.82, required on edition 2024; below 1.82 keep the bare forms. `#[unsafe(naked)]` (1.88) is wrapped in every edition; no other attribute is. Every call to a foreign function sits in `unsafe {}`, unless the block declares it `safe fn` (1.82): only for a function sound for every argument. Every access to an extern static not declared `safe` is `unsafe` too.

- The `unsafe_code` lint also fires on `no_mangle`, `export_name` and `link_section`: a crate that sets it to `forbid` can use none of them.

## Declarations and Strings

- Name the ABI: `extern "C" fn`, `unsafe extern "C" { .. }`, never `extern fn` / `unsafe extern { .. }`. `missing_abi`
- Strings for C are `CString`: a `&str` has no NUL terminator. Keep the `CString` in a variable for the whole call: `let c = CString::new(s)?;`, then `c.as_ptr()`. Wrong: `let p = CString::new(s)?.as_ptr();` frees the string at the `;`, so `p` dangles. `dangling_pointers_from_temporaries`

```rust
use std::ffi::{CString, c_char};

unsafe extern "C" {
    fn strlen(s: *const c_char) -> usize;
}

// wrong: `strlen("hi".as_ptr().cast())`: C reads past the end of the `&str`
let s = CString::new("hi").expect("no interior NUL");
// SAFETY: `s` is a live NUL-terminated buffer for the whole call.
let n = unsafe { strlen(s.as_ptr()) };
```

- A string from C stays borrowed: `unsafe { CStr::from_ptr(p) }.to_str()`, handling its `Err` (not UTF-8), never `strlen` plus a copy plus `set_len`. Call it only when `p` is NUL-terminated and C leaves the bytes unchanged while the `&str` lives.

## Types and Panics at the Boundary

- Every type crossing the boundary is C-compatible, and every struct is `#[repr(C)]`: no `String`, `Vec<T>` or Rust `enum` by value. A C `int` / `long` / `char` is `std::ffi::c_int` / `c_long` / `c_char`, never a guessed `i32` / `i64`. `improper_ctypes`, `improper_ctypes_definitions`
- Take an integer or a flag from C as an integer and convert it with a checked `match`: a Rust `enum` parameter is UB for any value matching no variant, a `bool` for any byte but 0 or 1.
- A panic reaching an `extern "C"` boundary aborts the process (1.81; UB before). Catch it inside with `catch_unwind`. Declare `extern "C-unwind"` (1.71) only when the caller can unwind.

```rust
use std::ffi::c_int;
use std::panic::catch_unwind;

enum Mode {
    Read,
    Write,
}

fn apply(_mode: Mode) {}

#[unsafe(no_mangle)]
pub extern "C" fn set_mode(raw: c_int) -> c_int {
    // wrong: a `mode: Mode` parameter
    let mode = match raw {
        0 => Mode::Read,
        1 => Mode::Write,
        _ => return -1,
    };
    // wrong: a bare `apply(mode)` that can panic
    match catch_unwind(|| apply(mode)) {
        Ok(()) => 0,
        Err(_) => -2,
    }
}
```

## Pointers and Ownership Across the Boundary

- A foreign pointer arrives as a raw pointer and is null-checked before use: `unsafe { p.as_ref() }` returns `Option<&T>`. That checks null only: alignment and validity stay the foreign side's promise. Never declare it `&T`.
- Foreign code never aliases a live `&mut` or writes through a pointer to immutable data: a writing C function gets a `*mut` from a `&mut`.
- A foreign opaque type gets its own `#[repr(C)]` struct with a private field and no constructor, passed as `*mut Foo`: never `*mut c_void`, never an empty enum.
- A function pointer crossing FFI is `Option<unsafe extern "C" fn(..)>`: null arrives as `None`. Never a plain `fn` type, never a transmuted null.
- One language allocates and frees each object. Wrap a foreign resource in a type whose `Drop` calls the foreign free function. Never `Box::from_raw` a pointer C allocated.
- A C callback holding a pointer to a Rust object is unregistered in that object's `Drop`; synchronize all state the callback touches.
- Bindings: raw declarations in a `*-sys` crate, a safe wrapper that checks inputs and every return code. Never `set_len` to a C-reported length before checking it.

## Checklist

- [ ] `unsafe extern "C"` blocks, `#[unsafe(no_mangle)]`, a named ABI on every foreign fn.
- [ ] Every type crossing is `#[repr(C)]` or a `c_*` type; an enum or a `bool` from C arrives as an integer and goes through a checked `match`.
- [ ] Every `CString` lives in a variable for the whole call; a C string read is borrowed through `CStr::from_ptr`.
- [ ] No panic can cross an `extern "C"` function.
- [ ] Every foreign pointer is null-checked; each object is freed by the language that allocated it; no `Box::from_raw` of a C pointer.
- [ ] Every registered callback is unregistered in its object's `Drop`.
