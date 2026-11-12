# Edition 2024 Gotchas

Load when a crate is on, or moving to, `edition = "2024"`, or when 2021-era code stops compiling or changes behavior there.

Read the crate's `edition` and `rust-version` in `Cargo.toml` first: on an older edition, or below a version given in parentheses, keep the older form.

## Migration

The behavior changes that bite silently or block migration. This is not a migration guide: run `cargo fix --edition`, then consult the official Rust 2024 Edition Guide for the full checklist. New projects: `edition = "2024"`, `rust-version = "1.85"` or newer.

- Every `[package]` names its `edition`: without the key Cargo falls back to 2015. A virtual workspace manifest has no `[package]` and names none.
- `cargo fix --edition` output is a conservative conversion that keeps the old semantics: review its diff, do not treat it as the recommended form.
- `cargo fix --edition` applies the `rust_2024_compatibility` lint group; `#![warn(rust_2024_compatibility)]` on the old edition (1.85) shows its warnings first. Its lints are named at the rules below. `if_let_rescope`, `tail_expr_drop_order`, `impl_trait_overcaptures`, `unsafe_attr_outside_unsafe`, `missing_unsafe_on_extern`, `deprecated_safe_2024`, `rust_2024_incompatible_pat`, `edition_2024_expr_fragment_specifier`, `rust_2024_guarded_string_incompatible_syntax` and `rust_2024_prelude_collisions` are allow-by-default: nothing warns until the group or the lint is turned on. `tail_expr_drop_order` proposes no fix: resolve its warnings by hand.

## Hard Errors and Loud Lints

- **`unsafe(...)` attribute wrappers required**: `#[unsafe(no_mangle)]`, `#[unsafe(export_name = "...")]`, `#[unsafe(link_section = "...")]`; extern blocks become `unsafe extern "C" { ... }`. Why they're unsafe now: duplicate exported symbols are undefined behavior (`ffi.md` has the details). The `unsafe(..)` and `unsafe extern` spellings compile from 1.82 in every edition. Inside the block mark each item `safe fn` (callable without `unsafe`) or `unsafe fn`. `unsafe_attr_outside_unsafe`, `missing_unsafe_on_extern`
- **References to `static mut` are rejected by default**: `static_mut_refs` is a deny-by-default lint (`#[allow]`-able, unlike a true hard error). Reach for atomics, `Mutex`, or `OnceLock`; raw-pointer access (`&raw const X`) is the escape hatch for genuine FFI statics.
- **`env::set_var` / `env::remove_var` are `unsafe`**: a call outside an `unsafe {}` block stops compiling. Why: mutating the process environment races other threads reading it (a real intermittent-test-failure source; see `testing.md`). Call only in single-threaded context, and only in a crate that does not set `unsafe_code = "forbid"`. Under `forbid` no `unsafe` block compiles, in tests either, and `forbid` cannot be allowed back on: keep it, pass the value in (a parameter or a config struct) so a unit test touches no environment, and test the code that reads the variable in `tests/*.rs` by running the binary with the variable set: `Command::new(env!("CARGO_BIN_EXE_<name>")).env("APP_CONFIG", "test.toml")` (`<name>`: the binary target's name). `CommandExt::before_exec` is `unsafe` too and deprecated: use `pre_exec`. `deprecated_safe_2024`
- **`unsafe_op_in_unsafe_fn` warns by default** (lint, not an error): bodies of `unsafe fn` need explicit inner `unsafe {}` blocks.
- **Macro captures need fragment specifiers**: a bare `$x` arm no longer parses (every edition from 1.89). Also, `:expr` now matches `_` and `const {}` blocks; use `:expr_2021` if an arm relied on the old refusal, and put a `(const $e:expr)` arm before a `($e:expr)` arm. `edition_2024_expr_fragment_specifier`
- **`gen` is reserved** (future generators). Rename identifiers or use `r#gen`. `keyword_idents_2024`
- **`#"foo"#` and `###` are reserved tokens**: in macro input separate them with spaces (`# "foo" #`, `# # #`). `rust_2024_guarded_string_incompatible_syntax`
- **Underscore spellings in `Cargo.toml` are removed**: write `[package]` (not `[project]`), `[dev-dependencies]`, `[build-dependencies]`, `default-features`, `crate-type`, `proc-macro`. Resolver v3 (MSRV-aware dependency resolution, 1.84; resolvers 1 and 2 do not prefer MSRV-compatible versions by default) becomes the default; a virtual workspace has no edition, so set `resolver = "3"` in its `[workspace]`.
- **Mixing match ergonomics with explicit `ref`/`mut` binding modes is an error**: go fully ergonomic or fully explicit per pattern. `let [x, mut y] = &[(), ()];` becomes `let &[ref x, mut y] = &[(), ()];` (`mut y` copies the element out; for a non-`Copy` type match the owned value: `let [x, mut y] = pair;`). `rust_2024_incompatible_pat`
- **`Future` and `IntoFuture` join the prelude**: a `.poll()` or `.into_future()` call that meant another trait is now ambiguous; write `<_ as MyTrait>::poll(&x)`. `rust_2024_prelude_collisions`

```rust
// does not compile
#[no_mangle]
pub extern "C" fn entry() {}
extern "C" {
    fn free(p: *mut core::ffi::c_void);
}
static mut COUNT: u32 = 0;
fn bump() -> u32 {
    let count = unsafe { &mut COUNT }; // `static_mut_refs`
    *count += 1;
    *count
}
fn init() {
    std::env::set_var("RUST_LOG", "debug");
}
```

```rust
use std::sync::atomic::{AtomicU32, Ordering};

#[unsafe(no_mangle)]
pub extern "C" fn entry() {}
unsafe extern "C" {
    pub safe fn sqrt(x: f64) -> f64;
    pub unsafe fn free(p: *mut core::ffi::c_void);
}
static COUNT: AtomicU32 = AtomicU32::new(0);
fn bump() -> u32 {
    COUNT.fetch_add(1, Ordering::Relaxed) + 1
}
fn init() {
    // An `unsafe_code = "forbid"` crate takes the value as a parameter instead (`testing.md`).
    // SAFETY: called before any other thread exists.
    unsafe { std::env::set_var("RUST_LOG", "debug") };
}
unsafe fn zero(p: *mut u8) {
    // SAFETY: the caller guarantees `p` is valid for writes.
    unsafe { *p = 0 };
}
```

## Silent Behavior Changes

- **RPIT captures all in-scope lifetimes by default.** `+ '_` workarounds become dead weight; remove them. If an unwanted lifetime now gets captured, opt out with `+ use<>` / `+ use<'specific>`. A `use<..>` list (1.82) names every in-scope type and const parameter; it replaces the `Captures` trick in every edition. `impl_trait_overcaptures`
- **Tail-expression temporaries drop before locals**, and `if let` temporaries drop before the `else` block rather than after the whole `if`/`else`. Old workarounds (hoisting an `if let` temporary into a `let` binding to satisfy the borrow checker) are now unnecessary churn; new code shouldn't cargo-cult them. `tail_expr_drop_order`, `if_let_rescope`
- A lock guard in an `if let` scrutinee is released before `else` runs. To hold it through both arms, in any edition, use `match`: its scrutinee temporaries live to the end of the statement.
- A reference into a tail-expression temporary no longer outlives the block (E0716): bind the value to a local first. The same goes for `pin!`, `format_args!` and `write!` temporaries in an `if let` scrutinee.
- **`Box<[T]>` implements `IntoIterator` by value** in 2024 code; older editions keep by-reference resolution for existing `.into_iter()` calls. Portable forms: `for x in boxed` for values, `boxed.iter()` for references. `boxed_slice_into_iter`
- **Never-type fallback changed from `()` to `!`** in diverging expressions (edition 2024; every edition from Rust 1.100): add an explicit annotation if a trait is implemented for `()` but not `!`, e.g. `f::<()>()?;` or `|| -> () { panic!() }`.
- **Doctests are merged into one crate**: tag a doctest that asserts on `Location` line numbers or `type_name` paths `standalone_crate`.
- **`default-features` on a `workspace = true` dependency** overrides `[workspace.dependencies]` only in a 2024 package on Rust 1.99+; anywhere else it does not apply.

```rust
use std::sync::RwLock;

fn bump(value: &RwLock<Option<u32>>) {
    // 2024: the read guard is dropped before `else`, so the write lock is free.
    // 2021: the guard lives through `else` and this deadlocks.
    if let Some(x) = *value.read().expect("lock poisoned") {
        println!("value is {x}");
    } else {
        *value.write().expect("lock poisoned") = Some(0);
    }
}
```

## New Tools Worth Adopting

- `if let Some(x) = a && x > 0 { .. }` (let chains: 1.88, edition 2024). On an older `rust-version` or edition keep the nested form.
- `async || {}` closures + `AsyncFn`/`AsyncFnMut` bounds (1.85, every edition; see `async.md`): prefer over `|| async {}` and `Fn() -> Fut` two-step bounds in new code.
- `rustfmt`'s `style_edition = "2024"` (version-sorted imports) opts in independently of the crate edition. Set it in `rustfmt.toml`: `cargo fmt` follows the crate edition, a direct `rustfmt` run does not.
- `#[diagnostic::do_not_recommend]` (1.85) on blanket impls that would otherwise pollute downstream error suggestions.

## Checklist

- [ ] every `[package]` names `edition` and `rust-version`; a 2024-only form appears only in a 2024 crate
- [ ] no bare `#[no_mangle]`, `#[export_name]`, `#[link_section]` or `extern` block
- [ ] no reference to a `static mut`; `set_var`/`remove_var` only inside `unsafe {}` before threads start, never in an `unsafe_code = "forbid"` crate (it passes the value in)
- [ ] every unsafe operation sits in an `unsafe {}` block, also inside an `unsafe fn`
- [ ] nothing relies on an `if let` or tail-expression temporary outliving its arm or block
- [ ] let chains only in a 2024 crate on `rust-version` 1.88 or newer
