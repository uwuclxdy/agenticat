# Lints

Load when adding or changing a crate's lint configuration (`[lints]` in `Cargo.toml`, `clippy.toml`) or suppressing a finding.
The block gates many rules. A lint that a rule in another file names but the block omits keeps its default level: the rule still holds, only an off lint has no gate. Lint names are clippy 1.99's.

## Wiring

- Set levels in `Cargo.toml` `[lints]` (Cargo 1.74+), never as a crate-root `#![warn(..)]` and never in `RUSTFLAGS`.
- A `warn` line fails nothing alone: the repo's gate must deny warnings. Cargo 1.97+: `CARGO_BUILD_WARNINGS=deny cargo clippy --all-targets --all-features`. Older Cargo: `cargo clippy --all-targets --all-features -- -D warnings`.
- Keep `--all-targets`: a plain `cargo clippy` skips test code, so no test lint fires.
- `deny` only for correctness or soundness, `warn` for everything else. `forbid` only where nothing may opt out: `unsafe_code` in the block, or one module (`#[forbid(clippy::float_arithmetic)] mod fixed_point;`).
- Clippy's default groups stay on; the block adds to them. Fix a `clippy::correctness` finding, never suppress it.
- MSRV lives in `rust-version`. Clippy reads it and holds back forms the crate cannot use yet. Set `msrv` in `clippy.toml` only when it must differ.
- Never enable `clippy::restriction` or `clippy::nursery` as a group and never `deny` the `clippy::pedantic` group: pick lints one by one.
- `cargo clippy -p <crate>` also lints the workspace members it depends on; add `-- --no-deps` to lint it alone.
- Workspace: paste the block into the root manifest as `[workspace.lints.rust]` and `[workspace.lints.clippy]`. A member inherits nothing until its own manifest says:

```toml
[lints]
workspace = true
```

## The Block

Each comment names the form the line catches.
A clippy older than a lint warns `unknown_lints` naming it: delete each named lint's line.

```toml
[lints.rust]
unexpected_cfgs = { level = "warn", check-cfg = ['cfg(has_foo)'] } # a `cfg` name nobody declared
unreachable_pub = "warn" # `pub` item no other crate can reach
missing_debug_implementations = "warn" # public type without `Debug`
elided_lifetimes_in_paths = "warn" # `Ref<T>`, not `Ref<'_, T>`
let_underscore_drop = "warn" # `let _ = guard();` drops the value at once
unsafe_code = "forbid" # `unsafe`, `no_mangle`, `export_name`, `link_section`; a crate that needs one deletes this line (not for `set_var` in tests)

[lints.clippy]
# deny: undefined behavior
as_ptr_cast_mut = "deny" # `v.as_ptr() as *mut T`, then a write
cast_ptr_alignment = "deny" # `*const u8` cast to `*const u16`, then `*p`
default_union_representation = "deny" # `union` without `#[repr(C)]`
transmute_undefined_repr = "deny" # `transmute` between `repr(Rust)` types
# bugs
read_zero_byte_vec = "warn" # `read(&mut Vec::with_capacity(n))` reads 0 bytes
path_buf_push_overwrite = "warn" # `p.push("/abs")` replaces the whole path
suspicious_xor_used_as_pow = "warn" # `2 ^ 8` meant as a power
precedence_bits = "warn" # `x & 0xF000 >> 12` without parentheses
float_cmp = "warn" # `x == y` on floats
lossy_float_literal = "warn" # `16_777_217.0_f32` rounds silently
invalid_upcast_comparisons = "warn" # `(x as u32) > 300` for `x: u8`
manual_midpoint = "warn" # `(a + b) / 2` overflows
unchecked_time_subtraction = "warn" # `instant - duration` can underflow
manual_instant_elapsed = "warn" # `Instant::now() - start`
case_sensitive_file_extension_comparisons = "warn" # `name.ends_with(".rs")`
filetype_is_file = "warn" # `file_type().is_file()` as "can read it"
create_dir = "warn" # `fs::create_dir`: fails on a missing parent
debug_assert_with_mut_call = "warn" # `debug_assert!` around a mutating call
significant_drop_in_scrutinee = "warn" # `match m.lock().unwrap().foo() { .. }`
fallible_impl_from = "warn" # `impl From` that unwraps or panics
match_wild_err_arm = "warn" # `Err(_) => panic!(..)`
unwrap_used = "warn" # `.unwrap()`, `.unwrap_err()`
match_wildcard_for_single_variants = "warn" # `_ =>` for one missing variant
match_same_arms = "warn" # two arms with identical bodies
mismatching_type_param_order = "warn" # `impl<B, A> Foo<B, A>` for `struct Foo<A, B>`
same_length_and_capacity = "warn" # `Vec::from_raw_parts(ptr, len, len)`
missing_fields_in_debug = "warn" # manual `Debug` that skips a field
unsafe_derive_deserialize = "warn" # `derive(Deserialize)` on a type with `unsafe fn`
no_mangle_with_rust_abi = "warn" # `no_mangle` fn without `extern "C"`
volatile_composites = "warn" # `write_volatile` on a struct
unused_result_ok = "warn" # `fallible().ok();` to drop a `Result`
assertions_on_result_states = "warn" # `assert!(r.is_ok())` hides the error
assert_is_empty = "warn" # `assert!(v.is_empty())`
# unsafe
undocumented_unsafe_blocks = "warn" # `unsafe { .. }` without `// SAFETY:`
multiple_unsafe_ops_per_block = "warn" # several unsafe operations in one block
borrow_as_ptr = "warn" # `&x as *const T`, not `&raw const x`
ptr_as_ptr = "warn" # `p as *const i32`, not `p.cast()`
transmute_ptr_to_ptr = "warn" # `transmute` between pointer types
# stale forms
non_std_lazy_statics = "warn" # `lazy_static!`, `once_cell::sync::Lazy`
uninlined_format_args = "warn" # `format!("{}", x)`
manual_let_else = "warn" # `let v = if let Some(v) = o { v } else { return };`
macro_use_imports = "warn" # `#[macro_use] extern crate`
ref_patterns = "warn" # `Some(ref x)`
ref_binding_to_reference = "warn" # `if let Some(ref x) = x`
manual_bit_width = "warn" # `u32::BITS - x.leading_zeros()`
manual_ilog2 = "warn" # `31 - x.leading_zeros()`
manual_is_power_of_two = "warn" # `x.count_ones() == 1`
manual_is_variant_and = "warn" # `o.map(f).unwrap_or_default()`
manual_string_new = "warn" # `"".to_string()`
inefficient_to_string = "warn" # `.to_string()` through a `&&str`
manual_assert = "warn" # `if !ok { panic!(..) }`
manual_assert_eq = "warn" # `assert!(a == b)`
checked_conversions = "warn" # `x <= i32::MAX as u32` before a cast
cast_lossless = "warn" # `x as u64` where `u64::from(x)` compiles
bool_to_int_with_if = "warn" # `if c { 1 } else { 0 }`
if_then_some_else_none = "warn" # `if c { Some(x) } else { None }`
map_unwrap_or = "warn" # `o.map(f).unwrap_or(a)`
get_unwrap = "warn" # `v.get(i).unwrap()`
option_as_ref_cloned = "warn" # `o.as_ref().cloned()`
return_and_then = "warn" # trailing `o.and_then(|x| ..)` where `?` fits
allow_attributes = "warn" # `#[allow(..)]`, not `#[expect(..)]` (1.81+)
allow_attributes_without_reason = "warn" # `#[allow(lint)]` or `#[expect(lint)]` with no `reason` (1.81+)
dbg_macro = "warn" # `dbg!(x)` left in
exit = "warn" # `process::exit` outside `main`
# iterators and loops
explicit_iter_loop = "warn" # `for x in v.iter()`
explicit_into_iter_loop = "warn" # `for x in v.into_iter()`
needless_for_each = "warn" # `v.iter().for_each(|x| ..)`
cloned_instead_of_copied = "warn" # `.cloned()` on `Copy` items
needless_collect = "warn" # `.collect::<Vec<_>>().len()`
search_is_some = "warn" # `.find(..).is_some()`
filter_map_next = "warn" # `.filter_map(f).next()`
flat_map_option = "warn" # `.flat_map(|x| x.parse().ok())`
iter_filter_is_ok = "warn" # `.filter(Result::is_ok)`
iter_filter_is_some = "warn" # `.filter(Option::is_some)`
iter_with_drain = "warn" # `v.drain(..)` on a `v` not used again
clear_with_drain = "warn" # `v.drain(..);` to empty `v`
unnecessary_join = "warn" # `.collect::<Vec<String>>().join("")`
redundant_closure_for_method_calls = "warn" # `.map(|c| c.to_uppercase())`
stable_sort_primitive = "warn" # `v.sort()` on primitives
range_minus_one = "warn" # `a..=(b - 1)`
index_refutable_slice = "warn" # `if let Some(s) = o { s[0] }`
# allocation and cost
redundant_clone = "warn" # `x.clone()` when `x` is dropped next
or_fun_call = "warn" # `o.unwrap_or(String::from("x"))`
assigning_clones = "warn" # `*a = b.clone()`
implicit_clone = "warn" # `v.to_vec()` on a `Vec`
format_push_string = "warn" # `s.push_str(&format!(..))`
with_capacity_zero = "warn" # `Vec::with_capacity(0)`
large_futures = "warn" # large future awaited unboxed
large_stack_arrays = "warn" # `[0u32; 1_000_000]` on the stack
large_types_passed_by_value = "warn" # large `Copy` type by value
trivially_copy_pass_by_ref = "warn" # `fn f(v: &u32)`
needless_pass_by_value = "warn" # `fn f(v: Vec<i32>)` that only reads `v`
unnecessary_box_returns = "warn" # `fn f() -> Box<String>`
linkedlist = "warn" # `LinkedList`
zero_sized_map_values = "warn" # `HashMap<K, ()>`
rc_buffer = "warn" # `Rc<String>`
rc_mutex = "warn" # `Rc<Mutex<T>>`
clone_on_ref_ptr = "warn" # `arc.clone()`, not `Arc::clone(&arc)`
inline_always = "warn" # `#[inline(always)]`
unused_async = "warn" # `async fn` with no `.await`
suboptimal_flops = "warn" # `a.log(2.0)`, `a.powf(1.0 / 2.0)`
needless_type_cast = "warn" # `const N: u16` cast `as usize` at every use
# types and signatures
derive_partial_eq_without_eq = "warn" # `derive(PartialEq)` without `Eq`
expl_impl_clone_on_copy = "warn" # manual `Clone` beside `derive(Copy)`
option_option = "warn" # `Option<Option<T>>`
ref_option = "warn" # `&Option<T>`, not `Option<&T>`
unnecessary_wraps = "warn" # fn that always returns `Some` or `Ok`
unnecessary_literal_bound = "warn" # `fn f(&self) -> &str { "lit" }`
fn_params_excessive_bools = "warn" # four or more `bool` parameters
struct_excessive_bools = "warn" # struct tracking state in `bool` fields
elidable_lifetime_names = "warn" # named lifetime where `'_` fits
trait_duplication_in_bounds = "warn" # `T: Clone` in both `<>` and `where`
type_repetition_in_bounds = "warn" # `where T: Copy, T: Clone`
use_self = "warn" # `Foo` inside `impl Foo`, not `Self`
renamed_function_params = "warn" # trait method params renamed in an impl
default_trait_access = "warn" # `let s: String = Default::default();`
explicit_deref_methods = "warn" # `a.deref()`
mut_mut = "warn" # `&mut &mut T`
enum_glob_use = "warn" # `use Ordering::*;`
wildcard_imports = "warn" # `use some_crate::*;`
# matches, literals, statements
collapsible_else_if = "warn" # `else { if c { .. } }`
equatable_if_let = "warn" # `if let Some(2) = x`
ignored_unit_patterns = "warn" # `Ok(_)` for `Ok(())`
unnested_or_patterns = "warn" # `Some(0) | Some(2)`
needless_bitwise_bool = "warn" # `a & !b` between `bool`s
useless_let_if_seq = "warn" # `let x; if c { x = 1 } else { x = 2 }`
items_after_statements = "warn" # `fn` declared mid-block, after its caller
used_underscore_binding = "warn" # `let _x = 0;` then `_x + 1`
unreadable_literal = "warn" # `61864918973511`
decimal_bitwise_operands = "warn" # `flags & 14`
duration_suboptimal_units = "warn" # `Duration::from_millis(50_000)`
single_char_pattern = "warn" # `s.split("x")`
str_split_at_newline = "warn" # `s.trim().split('\n')`
unnecessary_debug_formatting = "warn" # `{:?}` on a `Path`
use_debug = "warn" # `{:?}` in `println!` or `write!` output
pathbuf_init_then_push = "warn" # `PathBuf::new()` then `push`
# tests
ignore_without_reason = "warn" # bare `#[ignore]`
should_panic_without_expect = "warn" # bare `#[should_panic]`
redundant_test_prefix = "warn" # `#[test] fn test_parse()`
# Cargo.toml
wildcard_dependencies = "warn" # `regex = "*"`
negative_feature_names = "warn" # `no-abc = []` in `[features]`
```

## Rustc Lints

- rustc's own warnings (`unused_variables` and the like) need no line: the gate turns them into errors too.
- A custom `cfg` name known up front (Cargo 1.80+): declare it in the block's `unexpected_cfgs` line in place of `has_foo`; with none, delete that line. Never silence the lint with `level = "allow"`.
- A `cfg` set by a build script (Cargo 1.80+): print `cargo::rustc-check-cfg=cfg(has_foo)` from `build.rs` instead. Cargo features need neither.

## Clippy Config

File: `clippy.toml` or `.clippy.toml` at the repo root; any other name is ignored. Uncomment a line only when its condition holds.

```toml
# For `unwrap_used`; covers `#[test]` fns and `#[cfg(test)]` code only:
allow-unwrap-in-tests = true
# Crate with no external users: signature lints then cover `pub` items.
# avoid-breaking-exported-api = false
# Raise a limit here, never `#[allow]` it per function (default 7):
# too-many-arguments-threshold = 9
# A flags struct with more than 3 `bool` fields: `#[expect]` it, or raise the limit (default 3):
# max-struct-bools = 5
# Only when it must differ from `rust-version`:
# msrv = "1.82.0"
# Async `tracing` code: flag a `span.enter()` guard held across `.await`:
# await-holding-invalid-types = ["tracing::span::Entered"]
# List keys: ".." keeps the built-in defaults, leaving it out replaces them.
# disallowed-names = ["bar", ".."]
# Ban an API project-wide. Full path. Same keys under `[[disallowed-types]]`, `[[disallowed-macros]]`:
# [[disallowed-methods]]
# path = "std::some::path::to_method"
# reason = "why the project bans it"
# replacement = "std::other::path::to_method"
```

## Left Off

Every lint outside the block stays at its default. Never add these to a shared block:

| Lint | Why it is off | Turn on |
|---|---|---|
| `integer_division` | fires on every integer `/` | never crate-wide |
| `print_stdout`, `print_stderr` | fire on a binary's real output | in a library crate |
| `panic_in_result_fn` | fires on `assert!` in a test that returns `Result` | on a panic-free module |
| `tests_outside_test_module` | fires on every test under `tests/` | never |
| `mutex_atomic` | false positive on `Mutex<bool>` with a `Condvar` | never crate-wide |
| `try_err` | contradicts the default-on `needless_return_with_question_mark` | never |
| `panic` | tests need it | in library code; set `allow-panic-in-tests` to `true` |
| `expect_used` | `.expect("why")` is the sanctioned way to panic: `m.lock().expect("lock poisoned")` | never |
| `unwrap_in_result`, `indexing_slicing`, `arithmetic_side_effects` | noisy on ordinary code | on a panic-free or overflow-critical module |
| `cast_possible_truncation`, `cast_possible_wrap`, `cast_sign_loss`, `cast_precision_loss`, `as_conversions` | noisy on numeric code | per crate, after review; the fix is `u8::try_from(x)` |
| rustc `missing_docs` | noisy; a binary needs `//!` on its crate root too | in a library crate |
| rustc `unused_qualifications` | noisy while code moves; style only | per crate, by choice |
| rustc `unused_crate_dependencies` | false positive on a dependency only the package's binary uses | in a package with one crate |

On one module: `#[warn(clippy::indexing_slicing)] mod parser;`.

## Suppressing One Finding

- Fix the code first. Suppress only a finding that is wrong at that site.
- Delete `assert!(true)`; `assert!(false)` becomes `panic!("why")` (a state that must not happen) or `unreachable!("why")` (a branch the logic rules out); `assert!(CONST)` on a named `const` moves into `const { assert!(CONST) }` (1.79+). `clippy::assertions_on_constants`
- Write `#[expect(lint, reason = "...")]` on the smallest item that needs it, never `#![allow(..)]` at the crate root for one site (Rust 1.81+); `allow_attributes` misses that form. `clippy::allow_attributes`, `clippy::allow_attributes_without_reason`
- `rust-version` below 1.81: every suppression is a plain `#[allow(lint)]`. `#[expect]` and `reason` need 1.81; clippy holds both lints back below it.
- A lint that fires on some targets only (`unused_mut` on a binding only one platform mutates): `#[expect]` warns on the targets where the lint stays silent. When one `cfg` names exactly the targets it fires on: `#[cfg_attr(not(windows), expect(unused_mut, reason = "only Windows mutates it"))]`. When none does, keep `#[allow]` and list `clippy::allow_attributes` with it: `#[allow(clippy::allow_attributes, unused_mut, reason = "only modified on some platforms")]`.
- `use_debug` fires on `eprintln!("{err:?}")`, the form that prints an `anyhow` error chain: keep it under `#[expect(clippy::use_debug, reason = "..")]` (1.81+).

```rust
// fragment
// wrong: no reason, and it stays after the code is fixed
#[allow(clippy::too_many_arguments)]
// right
#[expect(clippy::too_many_arguments, reason = "mirrors the C signature")]
```

## Checklist

- [ ] Levels sit in `[lints]`, not in `#![warn(..)]` or `#![deny(..)]`.
- [ ] Every workspace member has `[lints]` with `workspace = true`, or an empty `[lints]` to opt out on purpose.
- [ ] The gate denies warnings and passes `--all-targets`.
- [ ] No lint group enabled, no Left Off lint in a shared block.
- [ ] Every suppression is `#[expect(.., reason = "..")]` on the smallest item, bare or inside `cfg_attr`. Exceptions: plain `#[allow(..)]` on a `rust-version` below 1.81; `#[allow(clippy::allow_attributes, .., reason = "..")]` for a lint that fires on targets no single `cfg` names.
- [ ] No `clippy::correctness` finding is suppressed.
