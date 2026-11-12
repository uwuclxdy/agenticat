# Modern Rust

Load when code you touch uses an older form than the crate's `edition` and `rust-version` allow, when a deprecation or edition lint fires, or before using syntax or an API that may be newer than `rust-version`.
Each row gives the stale form, the current form, and the version or edition where the current form starts or the stale one breaks.

## Reading The Tables

- Read `edition` and `rust-version` in `Cargo.toml` first. Write Current when the crate reaches Since.
- On an older `rust-version` or edition keep the older form.
- A Since cell that says `error`, `deprecated` or names a lint: the stale form fails or warns from there. Fix it in code you touch.
- Since `always`: the stale form was never the right one.

## Edition 2024

The unsafe surface of edition 2024 in one file:

```rust
use std::sync::atomic::{AtomicU32, Ordering};

static COUNT: AtomicU32 = AtomicU32::new(0);

// SAFETY: no other global symbol is named `tick`.
#[unsafe(no_mangle)]
pub extern "C" fn tick() {
    COUNT.fetch_add(1, Ordering::Relaxed);
}

unsafe extern "C" {
    pub safe fn abs(x: i32) -> i32;
}

/// # Safety
/// `p` must be valid for writes.
unsafe fn bump(p: *mut u32) {
    // SAFETY: the caller guarantees `p` is valid for writes.
    unsafe { *p += 1 };
}

fn main() {
    let mut n = 0u32;
    // SAFETY: the pointer comes from the live local `n`.
    unsafe { bump(&raw mut n) };
    tick();
    println!("{} {} {n}", abs(-3), COUNT.load(Ordering::Relaxed));
}
```

| Stale | Current | Since |
|---|---|---|
| `edition = "2021"` or no `edition` key in a new crate | `edition = "2024"` | 1.85 |
| `#[no_mangle]`, `#[export_name = ".."]`, `#[link_section = ".."]` | `#[unsafe(no_mangle)]`, `#[unsafe(export_name = "..")]`, `#[unsafe(link_section = "..")]` | 1.82; bare form is an error in 2024 |
| `extern "C" { .. }`, `extern { .. }` | `unsafe extern "C" { .. }`; an item callable without `unsafe` is `pub safe fn` | 1.82; bare block is an error in 2024 |
| unsafe operations bare in an `unsafe fn` body | each inside `unsafe { .. }` | 2024, `unsafe_op_in_unsafe_fn` |
| `env::set_var(k, v)`, `env::remove_var(k)` | `cmd.env(k, v)`, `cmd.env_remove(k)` for a child; under `unsafe_code = "forbid"`, pass the value in (tests: `testing.md`); else in `unsafe { .. }`, single-threaded (always sound on Windows) | `unsafe` in 2024 |
| `cmd.before_exec(f)` | `unsafe { cmd.pre_exec(f) }` | `pre_exec` 1.34; `before_exec` deprecated 1.37, `unsafe` in 2024 |
| `&X`, `&mut X`, `X.len()` on a `static mut X` | an atomic, `Mutex` or `LazyLock` static; a raw pointer via `&raw mut X` | `static_mut_refs`: warn 1.77, deny in 2024 |
| `if let Some(x) = *lock.read().unwrap() { .. } else { .. }` relying on the guard living through `else` | the guard drops before `else`; to hold it through the fallback write a `match`: its scrutinee temporary lives to the end of the `match` | 2024 |
| `let n = { &String::from("ab") }.len();` | `let s = { &String::from("ab") }; let n = s.len();` | error in 2024 |
| a temporary inside `pin!`, `format_args!`, `write!` arguments used after the statement | bind it to a local first | 1.92; `if let` scrutinees 1.91, edition 2024 |
| `fn gen()`, `let gen = ..`, `x.gen()` | another name, or `r#gen`: `x.r#gen()` | keyword in 2024 |
| `let [x, mut y] = &pair;` | `let &[ref x, mut y] = &pair;` | error in 2024 |
| `-> impl Trait + 'a` as an outlives trick, a `Captures<'a>` helper trait | `-> impl Trait + use<'a, T>`, listing every type and const parameter | `use<..>` 1.82, on trait methods 1.87; 2024 captures every in-scope lifetime by default |
| `if let Some(a) = f() { if a > 0 { .. } }` | `if let Some(a) = f() && a > 0 { .. }` | 1.88 and edition 2024 |
| `boxed_slice.into_iter()` (yields `&T` before 2024, `T` in 2024) | `.iter()` for references; `for x in boxed_slice` for values | 2024 |

## Rust 1.86 To 1.99

| Stale | Current | Since |
|---|---|---|
| `std::i32::MAX`, `std::u8::MAX`, `std::char::from_u32` | `i32::MAX`, `u8::MAX`, `char::from_u32` | `i32::MAX` 1.43, `char::from_u32` 1.52; legacy modules deprecated 1.99, `std::char` items 1.97 |
| calling a `#[deprecated]` item | the replacement its note names | `deprecated` lint, warn by default |
| `&s[..n]`, `s.split_at(n)` when `n` may fall inside a character | `&s[..s.floor_char_boundary(n)]`, `s.split_at_checked(n)` | 1.91, 1.80 |
| returning or storing `&local as *const T` | return the value, or heap-allocate what must outlive the call | always dangling; `dangling_pointers_from_locals` 1.91 |
| a hand-rolled `compare_exchange_weak` loop, `fetch_update` | `a.update(set_order, fetch_order, f)`, `a.try_update(..)` | 1.95; `fetch_update` deprecated 1.99 |
| `fn step() -> c_void` | no return type; `c_void` only behind a pointer | `c_void_returns` 1.98 |
| `env::vars()` moved into another thread | collect into a `Vec<(String, String)>` first | error 1.98 |
| `use a::*; use b::*;` then a name both export | import that name explicitly | traits: warning 1.95; more cases errors 1.98 |
| `pin!(&mut fut)` | `pin!(fut)` | 1.68; unsound 1.88-1.96 |
| `u32::BITS - x.leading_zeros()` | `x.bit_width()` | 1.97 |
| a concrete `Range<usize>` parameter in public API | `impl RangeBounds<usize>` | 1.28; also accepts the 1.96 `core::range` types |
| `if let` nested in a `match` arm body | an `if let` guard on the arm, plus a fallback arm | 1.95 |
| a `#[cfg(..)]`/`#[cfg(not(..))]` copy per platform, the `cfg-if` crate | `cfg_select! { unix => { .. } _ => { .. } }` | 1.95 |
| `"target/debug/mybin"` in an integration test | `env!("CARGO_BIN_EXE_mybin")`; a test run from an archive: `std::env::var(..)` | 1.43; run time 1.94 |
| an invented `is_initialized()` on a `LazyLock` | `LazyLock::get(&X)`: `None` while uninitialized or poisoned | 1.94 |
| `drop(write_guard)` then `rw.read()` | `RwLockWriteGuard::downgrade(write_guard)` | 1.92 |
| `-> std::slice::Iter<u8>` | `-> std::slice::Iter<'_, u8>` | `'_` 1.26; `mismatched_lifetime_syntaxes` 1.89 |
| `#[bench]` | Criterion or Divan | hard error 1.88 |
| `c.set(c.get() + 1)` on a `Cell` | `c.update(f)` | 1.88 |
| null passed where a valid pointer is required, even with length 0 | check `is_null()` first | `invalid_null_arguments` 1.88 |
| `env::var("HOME")` | `std::env::home_dir()` | undeprecated 1.87 |
| `libc::pipe` by hand; a thread per child stream | `std::io::pipe()?`; one writer clone per stream | 1.87 |
| `retain` plus a second pass, `drain_filter` | `v.extract_if(.., pred)` (`Vec`, B-tree); `m.extract_if(pred)` (`HashMap`, `HashSet`) | `Vec` 1.87, hash 1.88, B-tree 1.91 |
| an `as_super(&self) -> &dyn Super` helper | assign the `&dyn Sub` to a `&dyn Super` | 1.86 |
| `extern fn f()`, `extern { .. }` | `extern "C" fn f()`, `unsafe extern "C" { .. }` | `missing_abi` 1.86 |
| `while cell.get().is_none() {}` on a `OnceLock` | `cell.wait()` | 1.86 |

## Rust 1.70 To 1.85

One file with `LazyLock`, `let`-`else`, a let chain and inline format arguments (the let chain needs 1.88 and edition 2024):

```rust
use std::collections::HashMap;
use std::sync::LazyLock;

static PORTS: LazyLock<HashMap<&str, u16>> =
    LazyLock::new(|| HashMap::from([("http", 80), ("https", 443)]));

fn main() {
    for url in ["https://example.org", "http://localhost:8080", "nonsense"] {
        let Some((scheme, rest)) = url.split_once("://") else {
            eprintln!("skip {url}: no scheme");
            continue;
        };
        if let Some((_, port)) = rest.rsplit_once(':')
            && let Ok(port) = port.parse::<u16>()
        {
            println!("{url} -> {port}");
        } else if let Some(port) = PORTS.get(scheme) {
            println!("{url} -> {port} (default)");
        }
    }
}
```

| Stale | Current | Since |
|---|---|---|
| `impl Fn(u32) -> Pin<Box<dyn Future<Output = u32>>>` | `impl AsyncFn(u32) -> u32`, called with an `async` closure | 1.85 |
| `i8` or `u8` for a C `char` | `core::ffi::c_char` | 1.64; signedness follows the platform since 1.85 |
| `let p = make_vec().as_ptr();` (the `Vec` drops at `;`) | bind the `Vec` to a local first | `dangling_pointers_from_temporaries` 1.84 |
| `&x as *const T`, `&mut x as *mut T`, `addr_of!(x)` | `&raw const x`, `&raw mut x` | 1.82; below 1.82 `std::ptr::addr_of!` |
| `repeat(x).take(n)` | `std::iter::repeat_n(x, n)` | 1.82 |
| `o.map_or(false, f)`, `o.map_or(true, f)` | `o.is_some_and(f)`, `o.is_none_or(f)` | 1.70, 1.82 |
| hand-computed field offsets | `std::mem::offset_of!(T, field)` | 1.77; nested fields 1.82 |
| `#[allow(lint)]` | `#[expect(lint, reason = "..")]`; a lint that fires on only some targets keeps `#[allow(lint, reason = "..")]` | 1.81, `reason` too |
| `&std::panic::PanicInfo` in `panic::set_hook` | `&std::panic::PanicHookInfo` | 1.81; `PanicInfo` deprecated 1.82 |
| a panic escaping an `extern "C" fn` | `catch_unwind` inside it, or `extern "C-unwind"` when the caller can unwind | UB before 1.81; aborts since 1.81; `"C-unwind"` 1.71 |
| `Ord::cmp` built on `partial_cmp(..).unwrap_or(Equal)` | derive `PartialEq, Eq, PartialOrd, Ord` together; order floats with `a.total_cmp(&b)` | sorts panic on an inconsistent `Ord` 1.81; `total_cmp` 1.62 |
| `p.exists()` where an error must not read as missing | `fs::exists(p)?` | 1.81 |
| `lazy_static!`, `once_cell::sync::Lazy`, a `Mutex<Option<T>>` filled by hand | `static X: LazyLock<T>`; `LazyCell` on one thread; `OnceLock` when each caller supplies the initializer | `LazyLock` 1.80, `OnceLock` 1.70, `clippy::non_std_lazy_statics` 1.86 |
| a mistyped `#[cfg(feature = "..")]` | the declared name; custom cfgs declared with `check-cfg` | `unexpected_cfgs` 1.80 |
| `p.canonicalize()?` only to make a path absolute | `std::path::absolute(p)?` | 1.79 |
| `CStr::from_bytes_with_nul(b"hi\0").unwrap()` | `c"hi"` | 1.77 |
| `if !p.exists() { File::create(p)?; }` | `File::create_new(p)?` | 1.77 |
| an `async fn` calling itself directly | `Box::pin(walk(n)).await` | 1.77 |
| `#[async_trait]` or a hand-written `-> Pin<Box<dyn Future>>` on a trait used through generics | `async fn` in the trait; it never works behind `dyn` | 1.75 |
| `X.with(..)` plus `.borrow_mut()` on a thread-local `RefCell` | `X.with_borrow_mut(f)`, `X.with_borrow(f)` | 1.73 |
| `Arc::try_unwrap(a).ok()` | `Arc::into_inner(a)` | 1.70 |

## Before 1.70

| Stale | Current | Since |
|---|---|---|
| `&packed.field` on a `#[repr(packed)]` struct | copy the field by value | hard error 1.69 |
| `pin_mut!(fut)` | `let fut = pin!(fut);` with `std::pin::pin` | 1.68 |
| `let v = if let Some(v) = o { v } else { return };`, a `match` for one binding | `let Some(v) = o else { return };` | 1.65, `clippy::manual_let_else` 1.67 |
| `static M: LazyLock<Mutex<T>>` | `static M: Mutex<T> = Mutex::new(..);` | `Mutex::new` is `const` since 1.63 |
| `[String::new(); 3]`, `MaybeUninit` writes to fill an array | `std::array::from_fn` with a closure over the index | 1.63 |
| a hand-written `impl Default` for an enum | `#[derive(Default)]` and `#[default]` on one unit variant | 1.62, `clippy::derivable_impls` |
| `std::process::exit(1)` to end `main` | `fn main() -> Result<(), E>` or `-> ExitCode` | `ExitCode` 1.61 |
| a `while` loop calling `v.remove(i)` | `v.retain(f)`, `v.retain_mut(f)` | `retain_mut` 1.61 |
| a strong `Rc<Self>` field | a `Weak<Self>` field via `Rc::new_cyclic`; never `upgrade` in its closure | 1.60 |
| `thread_local! { static X: Cell<u32> = Cell::new(0); }` | `thread_local! { static X: Cell<u32> = const { Cell::new(0) }; }` | 1.59 |
| `format!("{}", x)`, `println!("{:?}", x)` | `format!("{x}")`, `println!("{x:?}")` | 1.58, `clippy::uninlined_format_args` 1.66 |
| `s.splitn(2, '=')` then `next()` twice, `s.starts_with(p)` then `&s[p.len()..]` | `s.split_once('=')`, `s.strip_prefix(p)` | 1.52, 1.45 |
| `a.compare_and_swap(cur, new, order)` | `a.compare_exchange(cur, new, success, failure)` | deprecated 1.50 |
| `e.description()` | `e.to_string()` or `{e}` | deprecated 1.42 |
| `let b = self.buf;` in a `&mut self` method, `v.clone()` then `v = Vec::new()` | `mem::take(&mut self.buf)`, or `mem::replace(&mut self.buf, new)` to leave `new` | `take` 1.40 |
| `o.as_ref().map(..)` to view an `Option<String>` as `Option<&str>` | `o.as_deref()` | 1.40 |
| `mem::uninitialized()` | an initialized value, or `MaybeUninit` | deprecated 1.39 |
| `#![feature(async_await)]` | delete the attribute | stable 1.39 |
| `big as u8` to narrow | `u8::try_from(big)?` | 1.34, `clippy::cast_possible_truncation` |
| `impl Into<U> for T`, `impl TryInto<U> for T` | `impl From<T> for U`, `impl TryFrom<T> for U` | `TryFrom` 1.34, `clippy::from_over_into` 1.51 |
| `ATOMIC_USIZE_INIT` | `AtomicUsize::new(0)` | deprecated 1.34 |
| `use std::io::Read;` only for its methods, when the name collides | `use std::io::Read as _;` | 1.33 |
| matching `Option<Result<T, E>>` into `Result<Option<T>, E>` by hand | `x.transpose()` | 1.33 |
| `s.trim_left()`, `s.trim_right_matches(p)` | `s.trim_start()`, `s.trim_end_matches(p)` | deprecated 1.33 |
| `-> impl Trait` returning another concrete type on another path | one concrete type on every path | always; `impl Trait` 1.26 |
| `try!(x)` | `x?` | 1.13 |
| `unsafe { *raw }` on a pointer that may be null | `unsafe { raw.as_ref() }`, which returns an `Option` | 1.9 |
| `m.contains_key(&k)` then `m.insert(k, v)` | `m.entry(k).or_insert(v)`, `.or_default()`, `.and_modify(f)` | always, `clippy::map_entry` |
| `a.store(a.load(o) + 1, o)` | `a.fetch_add(1, o)` | always |

## Editions 2021 And 2018

| Stale | Current | Since |
|---|---|---|
| `Box<Trait>`, `&Trait` | `Box<dyn Trait>`, `&dyn Trait` | error from 2021, `bare_trait_objects` |
| `0...9` in a pattern | `0..=9` | error from 2021 |
| `panic!(msg)` with a non-literal | `panic!("{msg}")`; a non-string payload goes through `std::panic::panic_any` | 2021 |
| relying on a closure capturing a whole struct | 2021 captures only the fields used; force the whole value with `let _ = &v;` inside the closure | 2021 |
| `array.into_iter()` expecting `&T` | `.iter()` for references; `for x in array` for values | 2021 |
| `extern crate foo;`, `#[macro_use] extern crate foo;` | `use foo::item;`, `use foo::some_macro;`; only `extern crate alloc;` stays, in `no_std` | 2018 |
| `use foo::Bar;` in a submodule to mean the crate root | `use crate::foo::Bar;`; a leading `::` always names an external crate | 2018 |

## Cargo And Tooling

| Stale | Current | Since |
|---|---|---|
| `[dev_dependencies]`, `default_features`, `[project]` | `[dev-dependencies]`, `default-features`, `[package]` | error in 2024 |
| a virtual workspace with no `resolver` key | `resolver = "3"` for edition 2024 members, `"2"` for 2021 | resolver 3: 1.84 |
| a dependency relying on features another crate enabled | list the features you use on your own entry | resolver 2, edition 2021 |
| `RUSTFLAGS="-Dwarnings"`, `cargo clippy -- -Dwarnings` | `CARGO_BUILD_WARNINGS=deny`, or `[build] warnings = "deny"` in `.cargo/config.toml` | 1.97 |
| hand-pinning old dependency versions for an old toolchain | declare `rust-version` and set `[resolver] incompatible-rust-versions = "fallback"` in `.cargo/config.toml` (the default under resolver 3) | 1.84 |
| `println!("cargo:rustc-link-lib=..")` in `build.rs` | `println!("cargo::rustc-link-lib=..")` | 1.77 |
| `cargo login <token>` | `cargo login`, then paste the token at the prompt | 1.86 |
| `cargo install` inside the package | `cargo install --path .` | 2018 |

Only in a 2024 package on 1.99+, write `default-features = false` on a `workspace = true` dependency whose workspace entry keeps default features; 1.85-1.98 rejects it there, earlier editions warn and ignore it.

## Checklist

- [ ] `edition` and `rust-version` read before choosing a form
- [ ] No Stale cell of this file matches the diff where the crate reaches Since
- [ ] No form newer than the crate's `rust-version` or edition introduced
- [ ] No `#[deprecated]` item called; no `#![feature(async_await)]`
- [ ] Edition 2024: `unsafe extern`, `#[unsafe(..)]` attributes, `unsafe { .. }` inside every `unsafe fn`, no reference to a `static mut`, no `gen` identifier
- [ ] Every API the diff newly uses confirmed in its docs or source
