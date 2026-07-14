# Async

Tokio-flavored; the principles transfer to any executor.

## Cancel Safety in `select!`

`tokio::select!` polls all branches and, the moment one completes, **drops every other branch** — including any partial state inside those futures. This compiles fine and only fails under load: a future halfway through filling a buffer loses those bytes silently.

| Operation | Cancel-safe? | Why |
|---|---|---|
| `mpsc::Receiver::recv()` | yes | nothing consumed on cancel |
| `broadcast::Receiver::recv()` | yes | position tracked in the receiver |
| `watch::Receiver::changed()` | yes | no data consumed |
| `oneshot::Receiver` (by `&mut`) | yes | message stays until received |
| `tokio::time::sleep` | one-shot only | dropping is clean, but recreating it every loop iteration resets the deadline — the timeout branch can starve forever; pin it outside the loop (pattern 2) |
| `AsyncReadExt::read()` | yes | partial reads surface to the caller |
| `AsyncReadExt::read_exact()` | **no** | partially filled buffer lost |
| `AsyncReadExt::read_to_end()` | **no** | accumulation lives inside the future |
| `AsyncWriteExt::write_all()` | **no** | unknown how much was written |
| tokio `Mutex::lock()` | **no** | cancelling loses your place in the fairness queue; same for `RwLock::read`/`write`, `Semaphore::acquire`, `Notify::notified` |
| accumulating into a `Vec` inside a branch | **no** | partial state inside the future |

Patterns for non-cancel-safe work inside a select loop:

1. **State outside the loop** — keep the buffer/accumulator as a local in the surrounding scope and use the cancel-safe primitive (`read`, not `read_exact`) to fill it incrementally.
2. **Pin the future once** with `std::pin::pin!` and poll the *same* future across iterations — it's never dropped mid-way.
3. **Spawn it** — a task behind a `JoinHandle` keeps running even if the handle's branch is dropped, and the handle itself is cancel-safe.

## Locks and `.await`

Never hold a lock across an `.await` point. A `std::sync::MutexGuard` isn't `Send`, so `tokio::spawn` refuses the future at compile time — but a future that's only `block_on`-ed or `spawn_local`-ed compiles fine and still deadlocks, and a tokio `Mutex` guard happily lives across awaits, serializing every task behind the slowest one. Scope the guard:

```rust
let value = {
    let state = state.lock().expect("mutex poisoned");
    state.value.clone()
}; // guard dropped before any await
process(value).await;
```

Reach for tokio's `Mutex` only when the critical section itself must await; otherwise `std`'s (or `parking_lot`'s) with tight scoping is faster and safer.

## Blocking in Async Context

CPU-heavy or blocking-IO work inside an async fn stalls the whole worker thread. Route it through `tokio::task::spawn_blocking` (or `rayon` for parallel compute). Anything touching `std::fs`, `std::process::Command::output`, or a synchronous client library counts as blocking.

## Channel Selection

| Channel | Use for |
|---|---|
| `mpsc` (bounded) | work queues — the bound is your backpressure |
| `mpsc::unbounded` | only when the producer is already rate-limited elsewhere; unbounded + fast producer = OOM |
| `oneshot` | single response to a single request |
| `broadcast` | fan-out where every consumer needs every message; lagging receivers lose oldest messages by design |
| `watch` | latest-value-wins state (config, shutdown flag); intermediate values are intentionally droppable |

## Async Functions in Traits

Native `async fn` in traits is stable (Rust 1.75+). For new code, don't reach for the `async_trait` macro crate unless you need dyn-compatibility — that's the one thing native async fns in traits don't give you yet.

For higher-order async, `AsyncFn`/`AsyncFnMut` bounds (Rust 1.85+) replace the `F: Fn() -> Fut, Fut: Future` two-parameter dance, and `async || {}` closures can borrow from captures, which `|| async {}` cannot.

## Spawned Child Processes: Drain Both Pipes

Spawning a child with piped stdout+stderr and polling only for exit deadlocks once a pipe fills (~64KiB on Linux): the child blocks on `write`, never exits, and the poll loop reads that as a hang or timeout. Drain **both** pipes concurrently with the wait (dedicated tasks/threads, joined after exit) — don't read only via a post-exit `wait_with_output` you never reach, and drain stderr even when the tool normally prints nothing there: deprecation warnings or progress bars can fill it.
