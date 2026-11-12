# Ownership

Load when a change moves, borrows, clones or shares a value, adds a lifetime or a smart pointer, or depends on when something drops.
Fix a borrow error by restructuring the borrows. `.clone()`, `Rc<RefCell<T>>`, `'static` and `unsafe` are last resorts. A version in parentheses is that form's minimum Rust: below the crate's `rust-version`, keep the older form.

## Moves and Clones

- Assigning or passing a `String`, `Vec`, `Box` or any other non-`Copy` value moves it: the old name is dead. Pass `&v` or `&mut v` to keep using it.
- A borrow error is no reason to `.clone()`. Clone only when two independent copies must exist; a clone made to quiet the compiler leaves two values that silently diverge. `clippy::redundant_clone`
- Know what `.clone()` copies: on `Rc`/`Arc` the handle (same data); on `&T` or `&mut T` with `T: Clone` the whole `T`; on `&str` or `&[T]` only the reference. Write `Rc::clone(&rc)` or `Arc::clone(&arc)` for a new handle and `&mut *x` to pass a `&mut` on. `clippy::clone_on_ref_ptr`
- Never `.clone()` a `Copy` value. Derive `Copy, Clone` together on a small plain-data type that will stay `Copy`. `clippy::clone_on_copy`
- `&str` to `String`, `&[T]` to `Vec<T>`: `.to_owned()`.
- Move a field out through `&mut self` with `mem::take(&mut self.f)` (leaves `Default`, 1.40), `mem::replace(&mut self.f, new)` or `Option::take()`. Never clone it and reset the original. `clippy::mem_replace_with_default`
- A field cannot move out of a type that implements `Drop`, nor out of a reference (`*r`): borrow it, or keep it in an `Option` and `.take()` it.
- A pattern that moves one field (`let P { name, ref age } = p;`) leaves `p` partially moved: only the unmoved fields stay usable. `..base` in a struct literal goes last and moves the non-`Copy` fields of `base`.
- A closure passed to `thread::spawn` or kept as a `'static` callback takes `move`; a closure used in the current scope does not.

```rust
use std::sync::{Arc, Mutex};
struct Queue { buf: Vec<u8> }
impl Queue {
    // WRONG: `let b = self.buf;` (E0507), or `self.buf.clone()` then `clear()`
    fn drain_all(&mut self) -> Vec<u8> {
        std::mem::take(&mut self.buf)
    }
}
let data = Arc::new(Mutex::new(vec![1, 2, 3]));
let handle = Arc::clone(&data); // same Mutex, same Vec
let copy: Vec<i32> = data.lock().expect("lock poisoned").clone(); // an independent Vec
```

## Borrowing

- A value has one `&mut` or any number of `&` at a time, never both. A borrow ends at its last use: move the last use of the `&` above the `&mut`. No extra `{}` block, no clone.
- Mutation needs all three: `let mut x`, `&mut x` at the call, `&mut T` in the signature. `&mut T` coerces to `&T`, never the reverse.
- Read-only parameter: `&str`, `&[T]`, `&Path`, `&T`. Never `&String`, `&Vec<T>`, `&PathBuf`, `&Box<T>`. In-place edits: `&mut [T]`, not `&mut Vec<T>`. `clippy::ptr_arg`
- A function that only reads takes `&T`; never take ownership and hand it back. A method takes `&self`, `&mut self` to mutate, `self` only to consume.
- Never return a reference to a value created inside the function: return the owned value.
- Never hold a reference into a `Vec` across a `push` on it: take the reference after the `push`.
- Two fields of one struct can be borrowed mutably together (`&mut s.a`, `&mut s.b`). Two elements of one slice cannot: `split_at_mut`.
- A reference into a temporary built inside a call's arguments dies at the `;`: bind the temporary with `let` first.
- `KEY.with(|v| ..)` on a `thread_local!` lends `v` only inside the closure: return a copy or a computed value, never `v`.
- A read-modify-write from an input `&T` into an output `&mut T`: compute in a local, then assign through the `&mut` once.
- Match on the place or a borrow of it (`match self.field`, `match self.name.as_str()`), never on `self.field.clone()`.
- Return a slice (`&str`, `&[T]`), not an index pair into another collection: the compiler keeps a slice valid.

```rust
// WRONG: fn name() -> &str { let s = String::from("x"); &s }
fn name() -> String {
    String::from("x")
}
// WRONG: fn sum(v: &Vec<i32>) -> i32
fn sum(v: &[i32]) -> i32 {
    v.iter().sum()
}
let mut v = vec![1, 2, 3];
let first = &v[0];
println!("{first}"); // last use of the shared borrow
v.push(4); // WRONG: this line above the println! (E0502)
let (l, r) = v.split_at_mut(1); // WRONG: `&mut v[0]` and `&mut v[1]` together (E0499)
std::mem::swap(&mut l[0], &mut r[0]);
println!("{} {}", name(), sum(&v));
```

## Lifetimes

- Let elision work: one input reference, or `&self`, already gives the output its lifetime. Write `Thing<'_>` for an elided lifetime inside a type path (1.26). `clippy::needless_lifetimes`, `elided_lifetimes_in_paths`
- Annotate when the returned reference can come from two or more inputs, and tie the output only to the inputs it borrows from.
- Never return `&'a T` made from a raw pointer (`unsafe { &*p }`) with `'a` tied to no input: the caller can pick any lifetime. Take `&T` and let elision bound the output.
- A struct that holds a reference needs a lifetime parameter: `struct Excerpt<'a> { part: &'a str }`. Default to owned fields (`String`, `Vec<T>`).

```rust
// WRONG: fn longest(x: &str, y: &str) -> &str (missing lifetime specifier)
fn longest<'a>(x: &'a str, y: &'a str) -> &'a str {
    if x.len() > y.len() { x } else { y }
}
// only `text` feeds the result, so only `text` carries 'a
fn find<'a>(needle: &str, text: &'a str) -> Option<&'a str> {
    text.lines().find(|line| line.contains(needle))
}
```

## Smart Pointers

| Need | Type |
|---|---|
| One owner on the heap; recursive type; trait object | `Box<T>` |
| Several owners, one thread | `Rc<T>` |
| Several owners, across threads | `Arc<T>` |
| Shared and mutable, one thread | `Rc<RefCell<T>>`, `Rc<Cell<T>>` |
| Shared and mutable, across threads | `Arc<Mutex<T>>`, `Arc<RwLock<T>>`, atomics |
| Back-reference, child to parent | `Weak<T>` |
| Usually borrowed, sometimes owned | `Cow<'a, str>`, `Cow<'a, [T]>` |
| Value that must not move | `Box::pin(v)`, `std::pin::pin!(v)` (1.68) |

- A recursive type holds itself through a `Box`: `enum List { Cons(i32, Box<List>), Nil }`. The bare `Cons(i32, List)` has infinite size.
- Do not box ordinary values. Use `Rc`/`Arc` only when the value really has several owners, `Arc` only when it crosses threads.
- `Rc` and `Arc` methods are associated functions: `Rc::clone(&a)`, `Rc::downgrade(&a)`, `Rc::get_mut(&mut a)`, `Rc::ptr_eq(&a, &b)`. `a == b` compares contents, not identity.
- There is no `&mut` through a shared `Rc`: `Rc::get_mut` returns `None` while another handle exists, `Rc::make_mut` clones on write. For shared mutation put a `Cell` or `RefCell` inside.
- A parent owns its children with `Rc`/`Arc`; a child points back with `Weak`. Two strong pointers at each other leak, and nothing reports it. `weak.upgrade()` returns an `Option`: handle `None`.
- Build a value that points at itself with `Rc::new_cyclic` (1.60) and store `me.clone()` in it; `me.upgrade()` inside that closure is always `None`.
- Never move an `Rc` to another thread or share a `RefCell` between threads (`Arc<RefCell<T>>`), and never write `unsafe impl Send`/`Sync` to force it: switch to `Arc`, `Mutex`, `RwLock`, atomics. A `static` must be `Sync`: `static X: RefCell<T>` does not compile.
- Return `Cow<'_, str>` when the input usually passes through unchanged. Read through deref; call `.to_mut()` or `.into_owned()` only to write.
- Pin with `Box::pin(v)` or `pin!(v)`, never `unsafe { Pin::new_unchecked(&mut local) }`. `Pin::new` works only for `Unpin` types.

## Interior Mutability

- Last resort. Try `&mut` and a better split of the data first; use a cell only to mutate behind `&self` (a cache, a counter, a test double).
- Pick by content: `Cell<T>` for `Copy` values (`get`, `set`), `RefCell<T>` for the rest, `OnceCell<T>` for set-once-then-read. Across threads: `Mutex`, atomics, `LazyLock` (1.80) for one fixed initializer, `OnceLock` (1.70) when each caller supplies it. Never the `lazy_static` or `once_cell` crates.
- A `LazyLock` is a `static`, never a `const`: a `const` is inlined, so every use builds its own value.
- `LazyCell::new(f)` (1.80) runs nothing: `f` runs at the first deref.
- `Cell::get` needs `T: Copy`; for other types use `replace`, or `take` (needs `Default`).
- `RefCell` checks borrows at run time: `borrow_mut()` while any other borrow of that cell is alive panics, and so does `borrow()` during a `borrow_mut()`. Several `borrow()` together are fine. Keep each guard in the smallest scope and never hold one across a call that may borrow the same cell.
- Where a conflict is possible and must not panic: `try_borrow()`, `try_borrow_mut()`.
- `r.clone()` on a `Ref` clones the value; `Ref::clone(&r)` clones the guard. Never `mem::forget` a guard or park one in a long-lived field: the cell stays borrowed forever.
- `OnceCell::set` returns `Err(value)` when the cell is already set: handle it. Never initialize a cell from inside its own `get_or_init` closure: it panics.
- A value read through `&T` can change when `T` holds a cell: re-read after a call that may write.
- Writing through a `&T` cast to `*mut T` is undefined behavior. Only the cell types may mutate behind `&`.

```rust
use std::cell::RefCell;
let log = RefCell::new(Vec::new());
// WRONG: let mut w = log.borrow_mut(); w.push(1); log.borrow().len() (panics: `w` is alive)
log.borrow_mut().push(1); // guard dropped at the `;`
let n = log.borrow().len();
assert_eq!(n, 1);
```

## Drop Order

| What | Dropped |
|---|---|
| Local variables; bindings of one pattern | reverse of declaration: last declared, first dropped |
| Struct fields | declaration order: first field first |
| Function arguments | reverse parameter order |
| Temporaries | end of the statement; in a `match` scrutinee: after the whole `match`; in a `while let` condition: after the loop body |
| Plain `if` or `while` condition temporaries | before the body runs |
| `if let` condition temporaries | after the `if` body; edition 2024: before the `else` block; earlier editions: after the `else` block too |
| Old value on reassignment | at once |

- Name a guard: `let _guard = lock();` lives to the end of the scope, `let _ = lock();` drops it at once. `clippy::let_underscore_lock`, `let_underscore_drop`
- A lock guard created in a `match`, `if let` or `while let` scrutinee is held through the body: take the value out in its own `let` statement first. `clippy::significant_drop_in_scrutinee`
- Release early with an inner `{ }` block or `drop(guard)`; `guard.drop()` does not compile (E0040). Declare struct fields in release order; never use `ManuallyDrop` to reorder.
- Cleanup that must run on every exit (early return, `?`, panic) goes in `impl Drop` on a guard bound to a local; there is no `finally`.
- Implement `Drop` only on a type that itself owns a resource. Fields drop on their own after `drop` returns: never free in `drop` what a field also frees.
- Never panic in `drop`: no `unwrap()`, no `expect()`. A panic while unwinding aborts the process, and so does any panic in the `drop` of a `thread_local!` value.
- Teardown that can fail or block gets its own method (`close(&mut self) -> Result<(), E>`); `drop` is the fallback and ignores or logs any error.
- Never make safety or secret erasure depend on `drop` running: `mem::forget`, an `Rc` cycle and `process::exit` all skip it.

```rust
use std::sync::Mutex;
struct Conn;
impl Conn { fn close(&mut self) -> std::io::Result<()> { Ok(()) } }
impl Drop for Conn {
    // WRONG: self.close().expect("close failed");
    fn drop(&mut self) { if let Err(_e) = self.close() {} }
}
let _conn = Conn; // WRONG: `let _ = Conn;` closes it on this line
let jobs = Mutex::new(vec![1, 2, 3]);
// WRONG: while let Some(j) = jobs.lock().unwrap().pop() { .. } (lock held in the body)
loop {
    let job = jobs.lock().expect("lock poisoned").pop(); // guard dropped at the `;`
    let Some(job) = job else { break };
    println!("{job}");
}
```

## Checklist

- Each `.clone()`: is a second independent copy needed? Otherwise borrow, `mem::take`, or `Rc::clone(&x)`.
- No `&String`, `&Vec<T>` or `&PathBuf` parameter; no returned reference to a local.
- No reference held across a `push` on its collection.
- No lifetime that elision would infer; no `'static` added to quiet an error.
- Each `Rc`/`Arc` graph: back-edges are `Weak`. No `Rc` crosses a thread; no `RefCell` is shared between threads.
- Each `RefCell` guard ends before the next borrow of that cell.
- No guard bound to `let _ =`; no lock created in a `match`, `if let` or `while let` scrutinee.
- No `unwrap`, `expect` or panic inside `drop`.
