# Observability

Load when code logs, emits `tracing` events or spans, instruments a function, or sets up a subscriber.
Logging and instrumentation for services and long-running tools. A CLI that prints and exits doesn't need spans: `eprintln!` or a plain logger is the right size there.

## `tracing` Over `log`

`tracing` supersedes `log` for anything async: events carry their span's context across `.await` points, where a flat log line loses the causal chain the moment two tasks interleave. Libraries emit events, spans and `#[instrument]` but install no global subscriber (`set_global_default`, `fmt::init()`): the binary owns that, once, at the top of `main`, before any task is spawned. A test may scope one with `with_default`.

Without a subscriber every event is silently dropped:

```rust
// fragment
// binary crate only: a library that makes this `fmt::init()` call conflicts with the binary's own subscriber
fn main() {
    tracing_subscriber::fmt::init(); // global default, filtered from RUST_LOG
    let number_of_yaks = 3;
    info!(number_of_yaks, "preparing to shave yaks");
}
```

- Filter from the environment, never from a hard-coded `with_max_level(..)`. `EnvFilter` and `with_env_filter` exist only with `tracing-subscriber`'s `env-filter` feature, which is off by default:

```rust
// fragment
// Cargo.toml: `tracing-subscriber` with `features = ["env-filter"]`
use tracing_subscriber::EnvFilter;

tracing_subscriber::fmt()
    .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")))
    .init();
```

- `RUST_LOG` takes comma-separated `target[span{field=value}]=level` directives (`my_crate=debug,hyper=warn`); a bare level applies to every target.
- Bridge `log`-emitting dependencies with `tracing-log`. `fmt::init()` and a builder's `.init()` install its `LogTracer` themselves (default feature `tracing-log`) and panic when a `log` logger is already set. Call `LogTracer::init()` yourself, once at startup, only when the subscriber goes in through `set_global_default`: until one of the two runs the bridge does nothing.

## One Span Per Unit of Work

A request, job, or connection gets one span (`#[instrument]` on the handler, or a manual `info_span!`), with the correlating IDs as span fields; every event inside then inherits them for free:

```rust
// fragment
#[tracing::instrument(skip(payload), fields(order_id = %order.id))]
async fn process(order: &Order, payload: Bytes) -> Result<Receipt> { /* ... */ }
```

- Prefer `#[instrument]` to a hand-made span: it creates and enters a span named after the function on every call.

```rust
// fragment
// WRONG: let span = info_span!("serve", request_id); let _enter = span.enter();  at the top of the body
#[tracing::instrument]
fn serve(request_id: u64) { /* request_id is recorded as a span field */ }
```

- `#[instrument]` records every argument it doesn't skip as a span field: `tracing` primitive types as typed values, all other types via `fmt::Debug`. `skip(...)` anything large, sensitive or without `Debug` (`skip_all` skips everything):

```rust
// fragment
// WRONG: #[tracing::instrument] alone: `&Connection` has no `Debug`, E0277
#[tracing::instrument(skip(conn))]
fn query(conn: &Connection) -> Result<()> { /* ... */ }
```

- Record the outcome with `#[instrument(ret, err)]`, not a hand-written event that never fires on the error path. `ret` records `Ok` values only; `err` needs `E: Display`, and an `E` that is only `Debug` takes `#[instrument(err(Debug))]`.
- An `#[instrument]` span is `INFO` unless overridden: a per-item function takes `#[instrument(level = "trace")]`.
- A function that cannot take `#[instrument]` (another crate's): `info_span!("json.parse").in_scope(|| parse(&buf))`.
- A field whose value arrives later is declared `field::Empty` at creation, then `span.record("name", value)`. `record` on an undeclared field silently does nothing.
- Create a child span while inside its parent: the span current at creation becomes the parent, not the one entered later.
- Enter and record unconditionally. On a filtered-out span both are no-ops; no `is_enabled`-style guard. Guard only an expensive value built for an event: `if enabled!(Level::DEBUG) { .. }` (`performance.md`).

## Span Guards and Async

Never hold an `enter()` guard across an `.await`: the span stays entered while other tasks run on the thread.

```rust
// fragment
use tracing::Instrument;

async fn my_async_function() {
    let span = info_span!("my_async_function");
    // WRONG: let _enter = span.enter();  held across the await below
    let some_value = span.in_scope(|| compute_sync()); // exited before the await point
    some_other_async_function(some_value).await;
}
// or attach the span to the whole future:
my_future.instrument(tracing::info_span!("my_future")).await;
```

Bind the guard to a name. A bare `span.enter();` statement exits the span at once:

```rust
// fragment
// WRONG: span!(Level::INFO, "my_span").enter();  guard dropped, the next event is outside the span
let _enter = span!(Level::INFO, "my_span").entered();
info!("inside my_span");
```

- A spawned task leaves the current span. Spawn `future.in_current_span()`, or `.instrument(child_span.or_current())` for a child span.
- Enter and drop a span guard on the same thread; an `EnteredSpan` is `!Send`.

## Structured Fields, Not Interpolation

```rust
// fragment
// BAD: the values are baked into prose; an aggregator can only regex them out
info!("order {id} placed, total {total_cents}");

// GOOD: machine-queryable fields, message stays constant
info!(order_id = %id, total_cents, "order placed");
```

`%field` captures via `Display`, `?field` via `Debug`. A constant message string groups identical events; the fields carry what varies.

- The bare `total_cents` shorthand needs a local variable of that name.
- Pass values, never pre-built strings: `greeting = ?my_struct` or `greeting = %my_struct.field`, not `greeting = format!("{:?}", my_struct)` or `.to_string()`. A formatted message goes last as plain format arguments, not through `&format!(..)`.
- Leave no `dbg!` in committed code: it is a debugging tool that dumps to stderr. `clippy::dbg_macro`

## Levels Mean Something

| Level | Contract |
|---|---|
| `error` | someone should act on this |
| `warn` | degraded but continuing; the best-effort path's per-item failures live here |
| `info` | state changes an operator would want on a dashboard |
| `debug` | developer-facing flow |
| `trace` | per-item/per-frame noise |

Gate per-item logging behind `trace` so `RUST_LOG=debug` stays readable on real workloads.

## No Secrets in Log Lines

Tokens, passwords, keys, personal identifiers and full auth headers never reach a log, including through `?struct` Debug capture on a type that holds credentials. Redact in a manual `Debug` impl (or skip the field) rather than trusting call sites to remember. Log lines outlive the process in aggregators; treat everything logged as exported.

```rust
// fragment
info!(token = %access_token, "authenticated"); // WRONG: the credential is now in every log store
info!(user_id = user.id, "authenticated");
```

A type holding a secret gets a hand-written `Debug` (never `#[derive(Debug)]`) and a test proving the secret never renders:

```rust
use std::fmt;

struct UserSecret(String);

impl fmt::Debug for UserSecret {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "UserSecret(...)")
    }
}

#[test]
fn no_leak() {
    let secret = UserSecret("552d...".to_string());
    assert!(!format!("{:?}", secret).contains("552d..."));
}
```

## Checklist

- [ ] The binary installs one subscriber in `main`, filtered by `RUST_LOG`; no library code installs a global one.
- [ ] Each request, job or connection has one span carrying its correlating IDs.
- [ ] Every `#[instrument]` skips arguments that are large, secret or not `Debug`.
- [ ] No `enter()` guard lives across an `.await`; every guard is bound to a name.
- [ ] Spawned futures carry a span (`.in_current_span()` or `.instrument(..)`).
- [ ] Values are fields with a constant message, not interpolated text or pre-built strings.
- [ ] Levels follow the table; per-item events and spans are `trace`.
- [ ] No token, password, key or personal identifier in a field, a message or a derived `Debug`.
