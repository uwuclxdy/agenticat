# Types and Traits

Load when code defines or matches an enum, writes a pattern, implements or bounds a trait, picks generics or `dyn`, or converts between types.
Covers enums and patterns, traits, generics versus `dyn`, conversions and std trait contracts. Naming and public API shape are in `api-design.md`.

## Enums and Patterns

```rust
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
enum Kind {
    #[default] // `#[derive(Default)]` on an enum needs `#[default]` on exactly one unit variant (1.62)
    A,
    B,
}

fn label(kind: Kind) -> &'static str {
    match kind {
        Kind::A => "a",
        Kind::B => "b", // every variant has an arm: a `match` with one missing does not compile
    }
}

enum List {
    Cons(i32, Box<List>), // WRONG: Cons(i32, List)  a recursive type has infinite size without a pointer
    Nil,
}

fn head(list: &List) -> Option<i32> {
    // WRONG: let List::Cons(head, _) = list;  a refutable pattern needs `else`, `if let` or `match`
    let List::Cons(head, _) = list else {
        return None; // the `else` block must diverge
    };
    Some(*head)
}
```

- `let PAT = x else { return .. };` (1.65) keeps the happy path flat; `if let` when one pattern matters; `match` when every case needs handling. `clippy::manual_let_else`
- `if let Some(x) = a && x > 0 { .. }` (let chains: 1.88, edition 2024). On an older `rust-version` or edition keep the nested form.
- Arms are tried top to bottom and the first match wins: specific arms first, catch-all last.
- A match guard (`Some(n) if n > 3 =>`) never counts toward exhaustiveness: keep a final unguarded arm. A match guard cannot mutate what the arm binds.
- Inclusive range pattern: `1..=5`, never `1...5` (hard error from edition 2021). `ellipsis_inclusive_range_patterns`
- Matching through a reference takes a plain pattern: `if let Some(y) = opt_ref` binds `y: &T`. No `ref`, no `&` inside the pattern.
- A bare name in a pattern is a new binding that matches everything, unless it resolves to a `const`, a unit struct or a unit variant in scope: those compare by value. Write variants qualified: `Kind::A`, never a bare `A`. A binding cannot shadow a `const`, a `static` or a const-generic parameter.
- A struct pattern lists every field or ends in `..`. A `match` on fixed-length slice patterns (`[a, b]`) needs a `_` arm.
- A `match` on the crate's own enum takes one arm per variant and no `_` arm, so adding a variant breaks the build at every dispatcher. `clippy::wildcard_enum_match_arm`
- Another crate's `#[non_exhaustive]` type: always a `_` arm on the enum, `..` in the struct pattern, and never a literal of the struct or of a variant that is itself marked. Another crate's enum without the attribute takes no `_` arm: its next variant should break the build.
- One `Option` value: `if let Some(x) = opt { .. }`, never `for x in opt { .. }`.
- `_` neither binds nor moves; `_name` binds, moves, and lives to the end of the scope. A drop guard (a lock, a span, a cleanup value) is therefore bound to a name:

```rust
// fragment
let _ = Foo;     // WRONG for a drop guard: destroyed immediately, cleanup already ran
let _exit = Foo; // kept alive to the end of the scope
```

## Traits and Bounds

A trait's methods are callable only while the trait is in scope; importing the type is not enough:

```rust
use std::io::Write as _; // required: without this import `out.write_all(..)` does not resolve

fn emit(out: &mut Vec<u8>) -> std::io::Result<()> {
    out.write_all(b"ok")
}
```

`use Trait as _;` (1.33) brings the methods in without binding the name.

Give a generic function every bound its body uses, and `?Sized` when it only borrows:

```rust
use std::fmt::Display;

// WRONG: fn describe<T>(value: &T) -> String           `{value}` needs `T: Display`
// WRONG: fn describe<T: Display>(value: &T) -> String  rejects `str` and `dyn Display`
fn describe<T: Display + ?Sized>(value: &T) -> String {
    format!("{value}")
}
```

- Bounds are not inherited: a struct's `T: Debug` does not carry into a function that takes the struct; repeat it there.
- Orphan rule: implement a trait only when the trait is local or a local type stands in the impl header, as the implementing type or as a type argument of the trait (`impl From<MyType> for ForeignType`). `impl ForeignTrait for Vec<MyType>` is rejected; `for MyType`, `for &MyType` and `for Box<MyType>` are fine.
- An impl method copies the trait's generics, parameters, return type and `where` clause exactly (else E0053).
- Declare parameters after `impl`: `impl<T> Point<T>`, `impl<'a> Parser<'a>`.
- Prefer several small traits to one broad trait. A type's core behaviour lives in inherent methods; its trait impls forward to them.
- Overload an operator only for an operation that matches the operator's meaning.
- A type or lifetime parameter that no field uses needs a `PhantomData` field.
- Give inference a target where it has none: `"42".parse::<i32>()`, `let v: Vec<String> = iter.collect();`. Generic arguments in an expression take the turbofish `::<`.

## Generics or `dyn`

| Need | Write |
|---|---|
| one concrete type per call site | generics: `fn f(x: impl Trait)` or `fn f<T: Trait>(x: T)`. Default choice |
| hide one returned type | `-> impl Trait` (1.26); every return path yields the same concrete type |
| several types in one collection, or a different type per branch | `Box<dyn Trait>` / `&dyn Trait`. Last resort after a concrete type, an enum, a generic |
| take a closure | `impl FnOnce(..)` if called once, `impl FnMut(..)` if called repeatedly (bind it `mut f`), `impl Fn(..)` only if it must not mutate. Never a `fn(..)` pointer type: it rejects capturing closures |
| store or return different closures | `Box<dyn Fn(..) -> T>`, or a generic field `F` |

```rust
use std::fmt::Display;

// WRONG: Box<Display>  a trait object is spelled `dyn` (hard error from edition 2021)
// WRONG: let f: Fn(i32) -> i32 = ..;  let g: impl Fn(i32) -> i32 = ..;  struct W { f: impl Display }
fn show(items: &[Box<dyn Display>]) -> String {
    items.iter().map(|item| item.to_string()).collect()
}

fn adder(n: i32) -> impl Fn(i32) -> i32 {
    move |x| x + n
}

fn boxed() -> Box<dyn Fn(i32) -> i32> {
    Box::new(|x| x + 1)
}
```

- A trait object is `dyn Trait` behind a pointer (`&dyn Trait`, `Box<dyn Trait>`), never a bare trait name. `bare_trait_objects`
- `impl Trait` stands only in argument and return position, never in a `let`, a field or a type alias.
- A trait used as `dyn` has no method that is generic, uses `Self` outside the receiver (a `Self` or `Box<Self>` return, a `Self` parameter), returns `impl Trait` or is an `async fn` (in traits since 1.75), unless that method carries `where Self: Sized`. Such a method, and any method taking `self` by value, cannot be called through `dyn`.
- `dyn Any` needs a `'static` type; to cross threads write `Box<dyn Any + Send>`.

## Conversions

| Conversion | Write |
|---|---|
| cannot fail | `impl From<A> for B`, never `impl Into<B> for A`: `.into()` comes free. `clippy::from_over_into` |
| can fail or lose data | `impl TryFrom<A> for B` (1.34), never a `From` that panics or truncates and never `impl TryInto`; `FromStr` for parsing text. `clippy::fallible_impl_from` |
| bound on a generic parameter | `T: Into<U>` or `T: TryInto<U>`, not `U: From<T>`: more argument types qualify |
| integer to a narrower integer | `u8::try_from(n)`, never `n as u8`. `clippy::cast_possible_truncation` |
| integer to a wider integer | `u64::from(n)`, not `n as u64`. `clippy::cast_lossless` |
| float to integer | validate first: `as` saturates and turns NaN into 0 |
| cheap borrowed view | `AsRef<T>`, never for a conversion that allocates or parses (write `From<&A>`). `AsRef` is not reflexive: a newtype passes a `T: AsRef<str>` bound only after its own `impl AsRef<str>`. `Borrow<T>` only when `Eq`, `Ord` and `Hash` agree with `T`'s |
| lookup by owned or borrowed key | `fn get<Q: ?Sized>(&self, k: &Q) where K: Borrow<Q>, Q: Hash + Eq`, as `HashMap::get` does; never `K: AsRef<str>` |
| text for a reader | `impl Display` (gives `to_string()` for free; it is never derived). A wire format gets its own method, not `to_string` |
| smart-pointer access | `Deref` only on pointer-like types, never to expose a field or imitate inheritance |

```rust
fn to_len(total: u32) -> Result<u8, std::num::TryFromIntError> {
    // WRONG: Ok(total as u8)  1234 silently becomes 210
    u8::try_from(total)
}
```

## Std Trait Contracts

| Trait | Contract |
|---|---|
| `Debug` | derive it on every type that is printed with `{:?}` or compared in `assert_eq!`. A hand-written one never renders empty, even for an empty value: an empty `Vec` prints `[]` |
| `PartialEq`, `Eq`, `PartialOrd`, `Ord` | derive all four together, or hand-write all four on top of `Ord::cmp`. Never mix derived and manual. Never override `ne`. `clippy::derive_ord_xor_partial_ord` |
| float fields | no `Eq` or `Ord` built on plain `==`/`<`: order at the call site with `a.total_cmp(&b)` (1.62), or base `PartialEq`, `Eq` and `Ord` all on `total_cmp`. Test NaN with `is_nan()`, never `==` |
| `Hash` | derive it with `Eq`, or hash exactly the fields `eq` compares, all into the one `Hasher`. `clippy::derived_hash_with_manual_eq` |
| `Clone`, `Copy` | derive `Copy` with `Clone`, only when every field is `Copy`, the type has no `Drop`, and it will stay `Copy`. On an `Eq` type `x.clone() == x` must hold. The derive bounds every type parameter (`T: Clone`): hand-write `Clone` when the fields clone for any `T`, as `struct Generate<T>(fn() -> T)` does |
| `Default` | derive it; override one field with `S { field: v, ..Default::default() }`, `..base` last |
| `Drop` | implement only on a type that owns a resource directly. Never panic in `drop`. Call `drop(x)`, never `x.drop()` |
| `Send`, `Sync` | keep a public type both where it can be (no `Rc` or `RefCell` field); a failed bound means switch to `Arc`, `Mutex` or an atomic, never `unsafe impl` |

A hand-written ordering puts the logic in `Ord::cmp` alone and hand-writes the other three on top of it:

```rust
use std::cmp::Ordering;

struct Person {
    last: String,
    first: String,
}

impl Ord for Person {
    fn cmp(&self, other: &Self) -> Ordering {
        self.last.cmp(&other.last).then_with(|| self.first.cmp(&other.first))
    }
}
impl PartialOrd for Person {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other)) // canonical: forward to `cmp`, never a second comparison here. `clippy::non_canonical_partial_ord_impl`
    }
}
impl PartialEq for Person {
    fn eq(&self, other: &Self) -> bool {
        self.cmp(other) == Ordering::Equal
    }
}
impl Eq for Person {}
```

- Sort by a field with `v.sort_by_key(|p| p.age)`; descending with `std::cmp::Reverse(p.age)`. A `sort_by` comparator only where the key has no `Ord`: `v.sort_by(|a, b| a.score.total_cmp(&b.score))` for a float field.
- `.clone()` on a `&mut T` compiles and deep-copies the pointee. Pass the handle on with a reborrow: `other(&mut *x)`, not `other(x.clone())`.
- `drop` stays best-effort:

```rust
// fragment
impl Drop for Conn {
    fn drop(&mut self) {
        // WRONG: self.close().expect("close failed");  a panic while unwinding aborts the process
        if let Err(_e) = self.close() {}
    }
}
```

## Checklist

- [ ] Every `match` is exhaustive without a guarded last arm and has no `_` arm over the crate's own enum; a refutable `let` has an `else`.
- [ ] No guard or lock is bound with a bare `let _ =`.
- [ ] Each generic function names the bounds its body uses; borrow-only parameters are `?Sized`.
- [ ] Trait objects are spelled `dyn`; `dyn` appears only where generics or an enum cannot do the job.
- [ ] Conversions are `From`/`TryFrom` impls; no narrowing `as`.
- [ ] `PartialEq`/`Eq`/`PartialOrd`/`Ord`/`Hash` are derived together or hand-written together; `Eq`/`Ord` over a float field only when all are `total_cmp`-based.
- [ ] No `Drop` impl can panic; no `Deref` impl exists only to reach a field.
