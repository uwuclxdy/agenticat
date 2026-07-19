# Edition 2024 Gotchas

The behavior changes that bite silently or block migration. This is not a migration guide: run `cargo fix --edition`, then consult the official Rust 2024 Edition Guide for the full checklist. New projects: `edition = "2024"`, `rust-version = "1.85"` or newer.

## Hard Errors and Loud Lints

- **`unsafe(...)` attribute wrappers required**: `#[unsafe(no_mangle)]`, `#[unsafe(export_name = "...")]`, `#[unsafe(link_section = "...")]`; extern blocks become `unsafe extern "C" { ... }`. Why they're unsafe now: duplicate exported symbols are linker-level UB with zero diagnostics (`unsafe.md` has the details).
- **References to `static mut` are rejected by default**: `static_mut_refs` is a deny-by-default lint (`#[allow]`-able, unlike a true hard error). Reach for atomics, `Mutex`, or `OnceLock`; raw-pointer access (`&raw const X`) is the escape hatch for genuine FFI statics.
- **`env::set_var` / `env::remove_var` are `unsafe`**: a call outside an `unsafe {}` block stops compiling. Why: mutating the process environment races other threads reading it (a real intermittent-test-failure source; see `testing.md`). Call only in single-threaded context.
- **`unsafe_op_in_unsafe_fn` warns by default** (lint, not an error): bodies of `unsafe fn` need explicit inner `unsafe {}` blocks.
- **Macro captures need fragment specifiers**: a bare `$x` arm no longer parses. Also, `:expr` now matches `_` and `const {}` blocks; use `:expr_2021` if an arm relied on the old refusal.
- **`gen` is reserved** (future generators). Rename identifiers or use `r#gen`.
- **Cargo.toml keys are kebab-case only** (`default-features`, not `default_features`), and resolver v3 (MSRV-aware dependency resolution) becomes the default.
- **Mixing match ergonomics with explicit `ref`/`mut` binding modes is an error**: go fully ergonomic or fully explicit per pattern.

## Silent Behavior Changes

- **RPIT captures all in-scope lifetimes by default.** `+ '_` workarounds become dead weight; remove them. If an unwanted lifetime now gets captured, opt out with `+ use<>` / `+ use<'specific>`.
- **Tail-expression temporaries drop before locals**, and `if let` temporaries drop at the end of the arm rather than the whole `if`/`else`. Old workarounds (hoisting an `if let` temporary into a `let` binding to satisfy the borrow checker) are now unnecessary churn; new code shouldn't cargo-cult them.
- **`Box<[T]>` implements `IntoIterator` by value** in 2024 code; older editions keep by-reference resolution for existing `.into_iter()` calls.
- **Never-type fallback changed from `()` to `!`** in diverging expressions: add an explicit annotation if a trait is implemented for `()` but not `!`.

## New Tools Worth Adopting

- `async || {}` closures + `AsyncFn`/`AsyncFnMut` bounds (see `async.md`): prefer over `|| async {}` and `Fn() -> Fut` two-step bounds in new code.
- `rustfmt`'s `style_edition = "2024"` (version-sorted imports) opts in independently of the crate edition.
- `#[diagnostic::do_not_recommend]` on blanket impls that would otherwise pollute downstream error suggestions.
