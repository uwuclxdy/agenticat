# Async

Load when writing or reviewing `async`/`.await` code: tokio tasks, `select!`, channels, timers, async IO, shutdown.

Tokio-flavored; the principles transfer to any executor. Threads, locks and atomics: `concurrency.md`. Versions in parentheses are minimums; on a lower `rust-version` keep the older form.

## Futures and Tasks

- `.await` or spawn every future: a call without `.await` runs nothing, and `let _ =` hides the warning. `unused_must_use`, `clippy::let_underscore_future`
- An `async fn` with no `.await` in its body suspends nowhere: make it a plain `fn`. `clippy::unused_async`
- An `async fn` call moves every argument into the future, and a borrowed one stays borrowed until the future is dropped: never move or mutate it before the `.await`.
- Entry points: `#[tokio::main] async fn main`; `#[tokio::test]` for an async test. Paused time (`#[tokio::test(start_paused = true)]`, `time::pause()`) needs tokio's `test-util` feature and the current-thread runtime.
- Tokio features: a library lists only those it uses, never `full`; the multi-thread runtime needs `rt-multi-thread`.
- New task: `tokio::spawn`, never `std::thread::spawn(async { .. })`. `.await`, `join!` and `select!` stay in the current task.
- `tokio::spawn` needs `Send + 'static`: `async move` with owned data or an `Arc` clone. A `!Send` future goes to `spawn_local` inside a `LocalSet` or a `LocalRuntime` (`Builder::new_current_thread().build_local(..)`); it still needs `'static`: `async move`.
- Only values alive across an `.await` must be `Send`: end their scope in a block first; `drop(x)` does not count.
- `handle.await` is `Result<T, JoinError>` (`Err`: the task panicked or was aborted). Dropping the handle detaches the task; to cancel, `abort()` then await it.
- Independent work: `tokio::join!(a(), b())` (`try_join!` for `Result`s), never `a().await; b().await`, never `join!(a().await, b().await)`.
- `join!` waits for all; `select!` returns on the first and drops the rest. Both run on one task: a blocking or lock-contending branch stalls all. Spawn it and select on the `JoinHandle`.
- `join!`/`select!` branches may borrow locals but share one task: one panic kills all. `spawn` for parallelism or panic isolation (`JoinError`).
- Accept loop: one `tokio::spawn` per connection, capped by a `Semaphore` permit each.
- A function awaits the tasks it spawned before it returns. A library spawns no task that outlives the call: it returns futures, and only the binary picks the runtime.
- `?` in an `async {}` block or a `select!` branch's async expression exits only that block: add a second `?` after the `.await`, or in the handler (`res = fut => { res?; }`), where `?` leaves the enclosing function.
- `break`/`continue` do not cross an `async {}` block: `return` from the block instead.
- Recursive `async fn`: `Box::pin(recurse(n - 1)).await` (1.77); below 1.77, a non-`async` fn returning a `BoxFuture`. Otherwise box a future only for dyn dispatch.
- A hand-written `poll` that returns `Pending` stores `cx.waker()` first, on every poll, or the task never wakes.

## Blocking Work

CPU-heavy or blocking-IO work inside an async fn stalls the whole worker thread. Route each one-off blocking call through `tokio::task::spawn_blocking`; CPU-bound work that is long or repeated goes to a dedicated pool (`rayon`, below). Anything touching `std::fs`, `std::process::Command::output`, or a synchronous client library counts as blocking. Tasks switch only at `.await`: keep the stretch between two awaits short.

| In async code, never | Use |
|---|---|
| `std::fs::read(p)` | `tokio::fs::read(p).await`, or the std call inside a `spawn_blocking` closure |
| `std::thread::sleep(d)` | `tokio::time::sleep(d).await` |
| `std::net::TcpListener` | `tokio::net::TcpListener` |
| `std::sync::mpsc`, `crossbeam` channels | `tokio::sync::mpsc` |
| `rt.block_on(f)`, `blocking_send`, `blocking_lock` | `f.await`, `send(v).await`, `lock().await`: the blocking forms panic inside a runtime |

- `spawn_blocking` takes a sync closure; `.await??` unwraps `JoinError`, then the inner error. It cannot be aborted once running: an endless loop goes on `std::thread::spawn`.
- Long or many CPU-bound jobs: a dedicated pool (`rayon`), not the blocking pool; result back over a `oneshot`.
- A long CPU loop inside a task: `tokio::task::yield_now().await` every 10-100 µs of work. Inside `join!`/`select!` the yield may not reach the scheduler: spawn the loop.
- `block_in_place` works only on the multi-thread runtime and stalls every other branch of its task: prefer `spawn_blocking`.
- Hand-built runtime: `Builder::new_multi_thread().enable_all().build()`; without `enable_all()` the first `sleep` or socket panics. Create timers inside the runtime: `rt.block_on(async { sleep(d).await })`, never `rt.block_on(sleep(d))`.
- Multi-thread is the default flavor; `current_thread` only for a single-threaded wrapper. `worker_threads(n)` only on a multi-thread builder. A current-thread runtime runs its tasks only inside `Runtime::block_on`; `Handle::block_on` does not drive it.
- Sync code feeding async: a runtime on its own thread, a tokio `mpsc` in, `blocking_send` from the sync side.

## Cancel Safety in `select!`

`tokio::select!` polls all branches and, the moment one completes, **drops every other branch**, including any partial state inside those futures. This compiles fine and only fails under load: a future halfway through filling a buffer loses those bytes silently. The drop notifies nothing and runs no cleanup except `Drop`.

| Operation | Cancel-safe? | Why |
|---|---|---|
| `mpsc::Receiver::recv()` | yes | nothing consumed on cancel |
| `broadcast::Receiver::recv()` | yes | position tracked in the receiver |
| `watch::Receiver::changed()` | yes | no data consumed |
| `oneshot::Receiver` (by `&mut`) | yes | message stays until received |
| `JoinSet::join_next()`, `Interval::tick()`, `Child::wait()` | yes | a lost race consumes nothing |
| `tokio::time::sleep` | one-shot only | dropping is clean, but recreating it every loop iteration resets the deadline; the timeout branch can starve forever; pin it outside the loop (pattern 2) |
| `AsyncReadExt::read()` | yes | partial reads surface to the caller |
| `AsyncReadExt::read_exact()` | **no** | partially filled buffer lost |
| `AsyncReadExt::read_to_end()`, `read_to_string()` | **no** | accumulation lives inside the future |
| `AsyncWriteExt::write_all()` | **no** | unknown how much was written; a retry starts over and duplicates bytes |
| `mpsc::Sender::send()` | **no** | the message is dropped; use `permit = tx.reserve() => permit?.send(msg)` |
| tokio `Mutex::lock()` | **no** | cancelling loses your place in the fairness queue; same for `RwLock::read`/`write`, `Semaphore::acquire`, `Notify::notified` |
| accumulating into a `Vec` inside a branch | **no** | partial state inside the future |

Patterns for non-cancel-safe work inside a select loop:

1. **State outside the loop**: keep the buffer/accumulator as a local in the surrounding scope and use the cancel-safe primitive (`read`, not `read_exact`) to fill it incrementally.
2. **Pin the future once** with `std::pin::pin!` (1.68; never `pin_mut!`) and poll the *same* future across iterations; it's never dropped mid-way.
3. **Spawn it**: a task behind a `JoinHandle` keeps running even if the handle's branch is dropped, and the handle itself is cancel-safe.

## `select!` Loops

- A branch is disabled when its pattern fails (`Some(v) = rx.recv()` on a closed channel) or its `, if cond` is false. `select!` panics when every branch is disabled and there is no `else`.
- An `f()` call written in a branch restarts every iteration: create the future before the loop, pin it, select on `&mut fut`. Polling it again after it completed panics: guard with `, if !done`.
- A branch's async expression is evaluated even when its `, if cond` is false: keep side effects in the handler.
- Branches are checked in random order. `biased;` checks top to bottom: put the shutdown branch first.
- Every branch handler evaluates to the same type.

```rust
// fragment
let mut op = std::pin::pin!(action()); // created and pinned once, outside the loop
let mut done = false;
loop {
    tokio::select! {
        res = &mut op, if !done => { done = true; handle(res); }
        Some(msg) = rx.recv() => { process(msg); }
        else => break, // every branch disabled
    }
}
```

## Locks and `.await`

Never hold a `std::sync::Mutex` (or `parking_lot`) guard across an `.await` point. A `std::sync::MutexGuard` isn't `Send`, so `tokio::spawn` refuses the future at compile time, but a future that's only `block_on`-ed or `spawn_local`-ed compiles fine and still deadlocks, and a tokio `Mutex` guard happily lives across awaits, serializing every task behind the slowest one. Scope the guard (`clippy::await_holding_lock`):

```rust
// fragment
let value = {
    let state = state.lock().expect("lock poisoned");
    state.value.clone()
}; // guard dropped before any await
process(value).await;
```

Reach for tokio's `Mutex` only when the critical section itself must await; otherwise `std`'s (or `parking_lot`'s) with tight scoping is faster and safer.

- Keep a `std` mutex inside a struct whose non-async methods do the locking: no guard ever appears in an async fn.
- An IO resource gets one owner task fed by an `mpsc` of commands, each carrying a `oneshot::Sender` for the reply.
- Bind a semaphore permit to a variable: a bare `sem.acquire().await?;` releases it at once. To move one into a task, share an `Arc<Semaphore>`: `sem.clone().acquire_owned().await?`.
- `Notify` carries no data and stores one permit: keep the queue beside it and drain it after each wake.

## Channel Selection

| Channel | Use for |
|---|---|
| `mpsc` (bounded) | work queues; the bound is your backpressure |
| `mpsc::unbounded` | only when the producer is already rate-limited elsewhere; unbounded + fast producer = OOM |
| `oneshot` | single response to a single request |
| `broadcast` | fan-out where every consumer needs every message; lagging receivers lose oldest messages by design |
| `watch` | latest-value-wins state (config, shutdown flag); intermediate values are intentionally droppable |

- One `mpsc::Receiver`, never cloned: clone the `Sender` per producer. `broadcast`: one `tx.subscribe()` per consumer.
- `recv()` returns `None` only after every `Sender` is dropped: `drop(tx)` once the producers hold their clones, then `while let Some(m) = rx.recv().await`. Clean stop: `rx.close()`, then drain until `None`.
- `mpsc::channel(0)` and `broadcast::channel(0)` panic: the minimum capacity is 1.
- `send` fails when the receiver is gone and returns the value: handle the `Err`, never `unwrap` or `expect`. `Ok` means queued, not handled. Stop early: select on `tx.closed()`.
- `oneshot`: `rx.await` (no `recv()`); `tx.send(v)` is sync and returns `Err(v)` when the receiver is gone: handle it, or discard it with `if let Err(_v) = tx.send(v) {}` (`let _ =` trips `let_underscore_drop` when `v` has a destructor, `drop(..)` trips `dropping_copy_types` when it is `Copy`).
- `broadcast`: on `Err(RecvError::Lagged(n))` keep going; never `unwrap` or `expect` a `recv`. A receiver sees only values sent after its `subscribe()`.
- `watch` loop: read `rx.borrow_and_update().clone()` before the first `changed().await` and after each; never hold the `Ref` across `.await`. Equal values notify too: compare before acting.

## Shutdown and Time

- `JoinSet`: `while let Some(res) = set.join_next().await`. Dropping the set aborts every task; `shutdown().await` aborts and waits; `join_all()` panics when a task failed.
- `tokio_util::task::TaskTracker`: spawn, `close()`, then `wait().await`; an unclosed tracker never resolves `wait`.
- Cooperative cancel: a `tokio_util::sync::CancellationToken` clone per task, `select!` on `token.cancelled()`, triggered by `tokio::signal::ctrl_c()`.
- A signal stream fires repeatedly: `loop { stream.recv().await; .. }`, not one `recv()`.
- No async `Drop`: a component that spawns tasks gets an explicit `async fn shutdown(&mut self)`.
- Bound a hanging network await: `tokio::time::timeout(d, fut).await` returns `Result<T, Elapsed>`.
- Periodic work: `interval(p)` + `tick().await`, not `sleep(p)` per loop; the first tick is immediate.

## Async IO

- `use tokio::io::{AsyncReadExt, AsyncWriteExt};` or `.read()`/`.write_all()` do not resolve.
- One `read` is not one message: buffer, parse a whole frame, then consume it. `Ok(0)` is EOF: break, or the loop spins.
- Read into a `BytesMut` with `read_buf` (cursor managed), not a `vec![0; n]` with a hand-kept cursor.
- Relay a whole stream: `tokio::io::copy(&mut rd, &mut wr).await?`, not a hand-rolled loop.
- `write_all`, not `write` (may write a prefix). `flush().await` a `BufWriter` before drop, or its buffered bytes are discarded; a tokio `File` too, to wait for the write.
- Many small `tokio::fs` writes: wrap the `File` in a `BufWriter`; each unbuffered write is its own blocking-pool dispatch.
- A timed-out `tokio::fs` write keeps running: rename the temp file into place only after the write returned `Ok`.
- Named pipes and devices: `tokio::net::unix::pipe` or `AsyncFd`, never `tokio::fs`.
- Read and write one socket at once: `split()` (same task) or `into_split()` (across tasks); signal EOF with `shutdown().await`.
- Connection handlers take `R: AsyncRead + Unpin` and `W: AsyncWrite + Unpin`, not a `TcpStream`, so tests pass mocks.
- Streams: `use tokio_stream::StreamExt;` then `while let Some(x) = s.next().await`, never `for`; `let mut s = std::pin::pin!(s);` when it is not `Unpin`.
- Independent stream items: `futures::StreamExt::for_each_concurrent(limit, ..)`, not one `.await` per item.

## Async Functions in Traits

Native `async fn` in traits is stable (Rust 1.75+). For new code, don't reach for the `async_trait` macro crate unless you need dyn-compatibility: such a trait does not compile behind `dyn`, so take a generic `T: Trait`. Its futures carry no `Send` bound: for `tokio::spawn` callers declare `fn f(&self) -> impl Future<Output = R> + Send`. `async_fn_in_trait`

For higher-order async, `AsyncFn`/`AsyncFnMut` bounds (Rust 1.85+) replace the `F: Fn() -> Fut, Fut: Future` two-parameter dance, and `async || {}` closures can borrow from captures, which `|| async {}` cannot.

## Spawned Child Processes: Drain Both Pipes

Spawning a child with piped stdout+stderr and polling only for exit deadlocks once a pipe fills (~64KiB on Linux): the child blocks on `write`, never exits, and the poll loop reads that as a hang or timeout. Drain **both** pipes concurrently with the wait: `wait_with_output()` does it, or dedicated tasks/threads joined after exit; never `wait()` first and read after. Drain stderr even when the tool normally prints nothing there: deprecation warnings or progress bars can fill it.

## Checklist

- [ ] every future awaited or spawned; no `.await` inside `join!`/`select!` arguments
- [ ] no std blocking call, `block_on` or `blocking_*` in async code
- [ ] no `std` lock guard alive across an `.await`
- [ ] each `select!` branch cancel-safe; `else` where branches can disable; loop futures pinned outside
- [ ] channels bounded; `send`, `recv` and `JoinHandle` errors handled, with no `unwrap` or `expect`
- [ ] read loops break on `Ok(0)`; writers flushed
