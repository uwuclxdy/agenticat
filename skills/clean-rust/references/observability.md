# Observability

Logging and instrumentation for services and long-running tools. A CLI that prints and exits doesn't need spans: `eprintln!` or a plain logger is the right size there.

## `tracing` Over `log`

`tracing` supersedes `log` for anything async: events carry their span's context across `.await` points, where a flat log line loses the causal chain the moment two tasks interleave. Bridge `log`-emitting dependencies with `tracing-log`. Libraries emit events and spans but never install a subscriber: the binary owns subscriber setup, once, in `main`.

## One Span Per Unit of Work

A request, job, or connection gets one span (`#[instrument]` on the handler, or a manual `info_span!`), with the correlating IDs as span fields; every event inside then inherits them for free:

```rust
#[tracing::instrument(skip(payload), fields(order_id = %order.id))]
async fn process(order: &Order, payload: Bytes) -> Result<Receipt> { /* ... */ }
```

`skip(...)` anything large or sensitive: `#[instrument]` Debug-formats every argument it doesn't skip.

## Structured Fields, Not Interpolation

```rust
// BAD: the values are baked into prose; an aggregator can only regex them out
info!("order {id} placed, total {total_cents}");

// GOOD: machine-queryable fields, message stays constant
info!(order_id = %id, total_cents, "order placed");
```

`%field` captures via `Display`, `?field` via `Debug`. A constant message string groups identical events; the fields carry what varies.

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

Tokens, passwords, keys, and full auth headers never reach a log, including through `?struct` Debug capture on a type that holds credentials. Redact in a manual `Debug` impl (or skip the field) rather than trusting call sites to remember. Log lines outlive the process in aggregators; treat everything logged as exported.
