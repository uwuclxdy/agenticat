# Concurrency

Threads, atomics, lock discipline, drop order. Async-specific rules live in `async.md`.

## Process-Global State Isn't a Locking Problem

Env vars and other process-global mutable state don't get safer behind a `Mutex` or atomic. The race is against every thread reading it, not just the writers. `env::set_var`/`remove_var` are `unsafe` for exactly this reason; call only in single-threaded context (`edition-2024.md`). Test-suite fallout from this pattern lives in `testing.md`'s Process-Global State Races section.

## Atomics Over `Mutex<primitive>`

A shared counter or flag is an `AtomicUsize`/`AtomicBool`, not a `Mutex<usize>` — no poisoning, no blocking, no guard to hold wrong.

## Choosing a Memory Ordering

Wrong ordering is a data race the compiler won't catch; blanket `SeqCst` is correct but pays full-barrier cost on ARM/RISC-V for nothing.

| Ordering | Use when |
|---|---|
| `Relaxed` | the operation is atomic but orders nothing else — counters, stats, IDs |
| `Acquire` | a load that must see everything before the matching `Release` store |
| `Release` | a store publishing writes for a matching `Acquire` load |
| `AcqRel` | read-modify-write (`compare_exchange`, `fetch_update`) acting as both |
| `SeqCst` | you need one total order across *multiple* atomics (rare — e.g. Dekker-style flags) |

The canonical handoff:

```rust
static READY: AtomicBool = AtomicBool::new(false);
static VALUE: AtomicU64 = AtomicU64::new(0);

// producer: payload first, then publish with Release
VALUE.store(v, Ordering::Relaxed);
READY.store(true, Ordering::Release);

// consumer: Acquire pairs with the Release; payload is then visible
if READY.load(Ordering::Acquire) {
    let v = VALUE.load(Ordering::Relaxed);
}
```

For small lock-free units, verify with `loom` — it exhaustively explores the interleavings the memory model permits, which no amount of stress testing does.

## Lock Ordering: ≥3 Nested Locks Means Code, Not Prose

"Acquire A before B before C" comments drift: a new call site inverts the order, deadlocks, and the comment never fired. Enforce the order structurally:

- Give every shared lock a **rank** (its position in one global order); wrap it so acquiring `debug_assert!`s "rank strictly greater than the highest rank currently held" on this thread.
- Keep the assert under `cfg(debug_assertions)` — it catches inversions in tests and dev, compiles to a zero-cost wrapper in release.
- Leave numeric gaps between ranks so future locks slot in without renumbering; seal the rank type so callers can't forge new ranks outside the lock-order module.

For ≤2 nested locks this is overkill — a comment plus a concurrency test suffices.

## Drop Order Is Observable

RAII guards (locks, transactions, spans, tempfiles) do real work in `Drop`, and the order is fixed:

| Construct | Drop order |
|---|---|
| Struct fields | declaration order — first declared, first dropped |
| Local variables | reverse declaration order — last declared, first dropped |
| Function arguments | reverse parameter order |
| Temporaries | end of statement (edition 2024 tweaks tail-expression scope — see `edition-2024.md`) |

Field declaration order is therefore a contract:

```rust
// BAD — guard drops first, releasing the lock while the
// transaction (which commits on drop) is still in flight
struct Session {
    guard: MutexGuard<'static, ()>,
    transaction: Transaction,
}

// GOOD — transaction commits, then the lock releases
struct Session {
    transaction: Transaction,
    guard: MutexGuard<'static, ()>,
}
```

For locals, an explicit `drop(guard)` beats relying on scope-exit order whenever the correct sequence isn't obvious from reading the code. When ordering is load-bearing, say so: `// NOTE: drop order matters — transaction before guard`.

## Scoped Threads

`std::thread::scope` (1.63+) borrows stack data across threads without `Arc` ceremony — reach for it before cloning into `move` closures for fork-join work. For data-parallel iteration, `rayon`'s `par_iter` is the higher-level tool.
