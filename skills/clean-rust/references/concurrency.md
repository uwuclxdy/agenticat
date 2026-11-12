# Concurrency

Load when writing or reviewing threads, `Arc`, locks, `Condvar`, atomics, `std::sync::mpsc`, lazy statics or `rayon` code.

Threads, atomics, lock discipline, drop order. Async-specific rules live in `async.md`. Versions in parentheses are minimums; on a lower `rust-version` keep the older form.

## Pick the Primitive

| Need | Use | Never |
|---|---|---|
| ownership shared across threads | `Arc<T>`, one `Arc::clone(&x)` moved into each thread | `Rc<T>` (not `Send`) |
| shared mutable data | `Arc<Mutex<T>>`; read-mostly: `Arc<RwLock<T>>` | `Arc<RefCell<T>>`, `Rc<Mutex<T>>` (`clippy::arc_with_non_send_sync`, `clippy::rc_mutex`) |
| global mutable state | `static M: Mutex<T> = Mutex::new(..);` (`const` since 1.63), atomic statics | `static mut` (`static_mut_refs`); `LazyLock<Mutex<T>>` when `T` has a `const` constructor |
| lazy global | `LazyLock` (1.80): one fixed initializer that must not panic (a panic poisons every later access). `OnceLock` (1.70): `get_or_init` with a caller-supplied initializer, retried after a panic | `lazy_static!`, `once_cell`, `Mutex<Option<T>>`, raw `Once` |
| per-thread state | `thread_local!` holding a `Cell`/`RefCell`, initializer `const { .. }` (1.59) | a thread-local as a channel between threads |
| threads that borrow locals | `std::thread::scope` (1.63) | `Box::leak`, cloning into `Arc` |
| data-parallel loop | `rayon`: `.par_iter()` with `use rayon::prelude::*;` | hand-spawned chunk threads |

- A non-`mut` `static`'s type must be `Sync`: no bare `RefCell`, `Cell` or `Rc`. It is never dropped: put no cleanup in its `Drop`. `OnceLock::set` keeps the first value and returns `Err(v)` afterwards.
- Never touch a `OnceLock` inside its own `get_or_init` closure: it deadlocks. To wait for another thread's init: `cell.wait()` (1.86), never a spin on `get()`. `LazyLock::get(&L)` (1.94) reads without initializing: `None` while uninitialized or poisoned.
- `thread_local!`: the reference inside `with` cannot leave the closure; a panic in the value's destructor aborts the process. From a `Drop` impl use `try_with`, not `with`. A `RefCell` value: `X.with_borrow_mut(|v| ..)` (1.73), not `with` plus `borrow_mut()`.

## Threads

- Keep every `JoinHandle` and `join()` it before `main` returns: when `main` ends, the process exits and kills detached threads mid-work.
- `join()` returns `Err` with a panic payload, not an `Error`: `std::panic::resume_unwind(e)`, or handle it at a subsystem boundary. Once `join()` returns, every write of that thread is visible: no extra flag.
- `thread::spawn(move || ..)`: the closure must own its captures.
- Crossing threads, `Arc<T>` and `RwLock<T>` need `T: Send + Sync`, `Mutex<T>` needs `T: Send`. Fix the inner type (`Rc` inside never crosses threads), never with `unsafe impl Send`/`Sync`: that impl is only for a raw-pointer wrapper (`unsafe.md`).
- Size a worker pool with `std::thread::available_parallelism()` (1.59); it returns `io::Result<NonZero<usize>>`.
- Take the value out of an `Arc` with `Arc::into_inner(a)` (1.70), never `Arc::try_unwrap(a).ok()`; never branch on `Arc::strong_count`. Copy-on-write: `Arc::make_mut(&mut a)`. `Arc::get_mut` is `None` while any other `Arc` or `Weak` exists.
- Porting to parallel: `Rc` -> `Arc`, `Cell` -> atomic, `RefCell` -> `Mutex`/`RwLock` (`borrow` -> `read`, `borrow_mut` -> `write`), then re-check every multi-step operation: it needs one lock held for the whole transaction.
- `rayon::join(|| a(), || b())` for two tasks: give each closure disjoint data (`split_at_mut`). Side effects of a parallel iterator arrive in any order.

### Scoped Threads

`std::thread::scope` (1.63+) borrows stack data across threads without `Arc` ceremony; reach for it before cloning into `move` closures for fork-join work. For data-parallel iteration, `rayon`'s `par_iter` is the higher-level tool.

- Captures still must be `Send`, and borrowed data `Sync` (`Rc` and `&Cell` fail).
- `scope` panics after joining when a thread panicked: `join()` each `ScopedJoinHandle` to handle it.

## Process-Global State Isn't a Locking Problem

Env vars and other process-global mutable state don't get safer behind a `Mutex` or atomic. The race is against every thread reading it, not just the writers. `env::set_var`/`remove_var` are `unsafe` for exactly this reason; call only in single-threaded context, never in an `unsafe_code = "forbid"` crate (`edition-2024.md`). Test-suite fallout from this pattern lives in `testing.md`.

## Locks

- Never `lock()` a `Mutex` this thread already holds (it hangs or panics): pass the guard or `&mut T` down instead.
- `RwLock`: no second lock on a thread that holds one, and no `read()` -> `write()` upgrade: drop the read guard first. Write to read: `RwLockWriteGuard::downgrade(g)` (1.92), never drop and re-lock.
- A `MutexGuard` is not `Send`: move an `Arc<Mutex<T>>` clone into the thread and lock there.
- Hold the guard for the protected work only: end its scope or `drop(guard)` before slow work, a `join()` or a blocking send.
- One guard covers a whole transaction: never re-lock per step (`m.lock().unwrap()[i]` in a loop).
- Poisoning: after a holder panicked, `lock()` returns `Err(PoisonError)`. Default: `.lock().expect("lock poisoned")` propagates the panic. To keep serving: `.lock().unwrap_or_else(|e| e.into_inner())`. Only a writer's panic poisons an `RwLock`.
- `parking_lot` locks do not poison: `lock()` returns the guard directly, with no `Result` to unwrap; the API is similar to std's, not identical.
- `try_lock` has two errors: `TryLockError::WouldBlock` (held elsewhere: retry) and `Poisoned(e)` (acquired but poisoned: the guard is `e.into_inner()`). Match both.
- `Condvar`: wait in a loop on the predicate, `while !*ready { ready = cv.wait(ready).expect("lock poisoned"); }` or `cv.wait_while(guard, |r| !*r)`, never one `if`. Set the state under the mutex, then `notify_one()`: a notify with no waiter is lost. One mutex per condvar.

## Lock Ordering: ≥3 Nested Locks Means Code, Not Prose

"Acquire A before B before C" comments drift: a new call site inverts the order, deadlocks, and the comment never fired. Enforce the order structurally:

- Give every shared lock a **rank** (its position in one global order); wrap it so acquiring `debug_assert!`s "rank strictly greater than the highest rank currently held" on this thread.
- Keep the assert under `cfg(debug_assertions)`: it catches inversions in tests and dev, compiles to a zero-cost wrapper in release.
- Leave numeric gaps between ranks so future locks slot in without renumbering; seal the rank type so callers can't forge new ranks outside the lock-order module.

For ≤2 nested locks this is overkill: a comment plus a concurrency test suffices.

## Atomics Over `Mutex<primitive>`

A shared counter or flag is an `AtomicUsize`/`AtomicBool`, not a `Mutex<usize>`: no poisoning, no blocking, no guard to hold wrong. A `Mutex` that pairs with a `Condvar` stays a `Mutex`: both lints misfire there. `clippy::mutex_atomic`, `clippy::mutex_integer`

- Types are `AtomicBool`, `AtomicUsize`, `AtomicPtr<T>`, ..: there is no stable `Atomic<T>`. Initialize with `AtomicUsize::new(0)`, never `ATOMIC_USIZE_INIT`. A pointer goes in `AtomicPtr<T>`, never as an address in `AtomicUsize`.
- One call per update: `n.fetch_add(1, ..)`, `best.fetch_min(x, ..)`; never `load` then `store` (lost update). `fetch_add` wraps on overflow.
- Load once into a local, then check and use that copy: a second `load` may return another value.
- A plain (non-atomic) write that races an atomic access is undefined behavior; a plain `bool` is never a cross-thread flag.
- An atomic reaches other threads through an `Arc`, a `static` or a scoped borrow.
- With `&mut` access to an atomic, or ownership of it: `get_mut()` or `into_inner()`, no ordering needed.

## Choosing a Memory Ordering

Wrong ordering is a data race the compiler won't catch; blanket `SeqCst` is correct but pays full-barrier cost on ARM/RISC-V for nothing. Unsure: use `SeqCst`, and weaken only with a written argument.

| Ordering | Use when |
|---|---|
| `Relaxed` | the operation is atomic but orders nothing else: counters, stats, IDs |
| `Acquire` | a load that must see everything before the matching `Release` store |
| `Release` | a store publishing writes for a matching `Acquire` load |
| `AcqRel` | read-modify-write (`compare_exchange`, `try_update`) acting as both |
| `SeqCst` | you need one total order across *multiple* atomics (rare, e.g. Dekker-style flags) |

- `load` accepts `Relaxed`/`Acquire`/`SeqCst`, `store` accepts `Relaxed`/`Release`/`SeqCst`: the other direction panics.
- `Release` and `Acquire` pair only on the same atomic. `Relaxed` on the ready flag of a handoff publishes nothing.
- `compare_exchange(current, new, success, failure)` takes two orderings; `failure` is `SeqCst`, `Acquire` or `Relaxed` (`Release`/`AcqRel` panic). It returns `Ok(previous)` or `Err(actual)`. `compare_exchange_weak` fails spuriously: use it only in a retry loop that feeds `Err(actual)` back. Never `compare_and_swap` (deprecated).
- Closure update: `a.update(set_order, fetch_order, |v| v + 1)` or `try_update` (both 1.95); `fetch_update` is deprecated (1.99). The closure may run several times: no side effects.
- A `fence` synchronizes only through an atomic operation between the threads; `fence(Relaxed)` panics. Prefer `Mutex`, `Condvar` or a channel to a protocol built from fences.

The canonical handoff:

```rust
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
static READY: AtomicBool = AtomicBool::new(false);
static VALUE: AtomicU64 = AtomicU64::new(0);

// producer: payload first, then publish with Release
VALUE.store(42, Ordering::Relaxed);
READY.store(true, Ordering::Release);

// consumer: Acquire pairs with the Release; payload is then visible
if READY.load(Ordering::Acquire) {
    let _v = VALUE.load(Ordering::Relaxed);
}
```

For small lock-free units, verify with `loom`: it exhaustively explores the interleavings the memory model permits, which no amount of stress testing does.

## Channels (`std::sync::mpsc`)

- `recv()` errs only after every `Sender`, the original and each clone, is dropped: `drop(tx)` after spawning the producers, then `for msg in &rx { .. }`, which ends at hangup. Never loop on `recv().unwrap()` or `.expect(..)`.
- Backpressure: `sync_channel(n)` blocks the sender when full; `channel()` is unbounded. There is no `bounded()`.
- One `Receiver`, not `Clone` and not shareable in an `Arc`: clone the `Sender` per producer.
- `try_recv`: `Err(TryRecvError::Empty)` means retry later, `Disconnected` means stop.

## Drop Order Is Observable

RAII guards (locks, transactions, spans, tempfiles) do real work in `Drop`, and the order is fixed:

| Construct | Drop order |
|---|---|
| Struct fields | declaration order: first declared, first dropped |
| Local variables | reverse declaration order: last declared, first dropped |
| Function arguments | reverse parameter order |
| Temporaries | end of statement (edition 2024 tweaks tail-expression scope; see `edition-2024.md`) |
| Closure captures (by move) | unspecified: never rely on it |

Field declaration order is therefore a contract:

```rust
// fragment
// BAD: guard drops first, releasing the lock while the
// transaction (which commits on drop) is still in flight
struct Session {
    guard: MutexGuard<'static, ()>,
    transaction: Transaction,
}

// GOOD: transaction commits, then the lock releases
struct Session {
    transaction: Transaction,
    guard: MutexGuard<'static, ()>,
}
```

For locals, an explicit `drop(guard)` beats relying on scope-exit order whenever the correct sequence isn't obvious from reading the code. When ordering is load-bearing, say so: `// NOTE: drop order matters; transaction before guard`.

## Checklist

- [ ] every spawned thread joined; borrowed data goes through `thread::scope` or `rayon`
- [ ] no `Rc`, `RefCell` or `static mut` shared across threads
- [ ] no lock taken twice on one thread; guard scope ends before slow work
- [ ] every `Condvar` wait loops on its predicate
- [ ] each ordering justified; no `load` then `store` update
- [ ] every `Sender` dropped where the receive loop must end
- [ ] fields declared in the order they must drop
