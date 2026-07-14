# Error Handling

Core discipline (no unwrap, thiserror vs anyhow, one failure semantics) is in `SKILL.md`. This file covers the judgment calls.

## Bind Once, Never Check-Then-Access

Checking a `Result`/`Option` and then accessing it separately splits one decision into two places that can drift:

```rust
// BAD — check and access are separate; the unwrap is a landmine
if config.is_err() {
    eprintln!("no config found, using defaults");
    return Ok(Settings::default());
}
let config = config.unwrap();

// GOOD — one match binds and decides
let config = match config {
    Err(_) => {
        eprintln!("no config found, using defaults");
        return Ok(Settings::default());
    }
    Ok(c) => c,
};
```

Same rule when the two branches produce different values — return a tuple from one `match` instead of probing with `.is_ok()` and re-deriving state later.

## Early-Return Guards Over Smuggled Conditions

A precondition belongs in a visible guard, not inside a combinator:

```rust
// BAD — the business rule hides inside a filter
let session = state.session().as_ref().filter(|_| config.keep_alive())?.clone();

// GOOD — the rule reads as a rule
if !config.keep_alive() {
    return None;
}
let session = state.session()?.clone();
```

## Pick the Right Helper at the Boundary

| Situation | Helper |
|---|---|
| Error type unifies | `?` alone |
| Type doesn't unify | `.map_err(...)?` |
| `Option` needs to become an error | `.ok_or(...)` / `.ok_or_else(...)` (anyhow: `.context(...)`, eyre: `.ok_or_eyre(...)`) |
| Add context to an existing chain | `.context("...")` / `.wrap_err("...")` |
| Unrecoverable with a fully-formed message | `bail!("...")` — prefer it over `return Err(anyhow!(...))`, but don't replace `?` or `.ok_or_else` with it |

Add context where the caller loses information, not on every hop:

```rust
fs::read(&path).with_context(|| format!("failed to read config at {}", path.display()))?;
```

## Designing Error Types

```rust
#[derive(Debug, thiserror::Error)]
enum OrderError {
    #[error("item {item_id} is out of stock")]
    OutOfStock { item_id: u64 },
    #[error("payment failed: {reason}")]
    PaymentFailed { reason: String },
    #[error("database error")]
    Database(#[from] sqlx::Error),
}
```

- Convert low-level errors into domain errors at module boundaries (`#[from]` impls or `.map_err`), so callers match on meaning, not on plumbing.
- One god-enum with 50 variants serves nobody — split per subsystem.
- Log at the point of *handling*, not creation. An error logged when constructed and again when handled shows up twice; one logged only at creation may never surface at all.
- Give "bad input, retry" failures a distinct type or variant from genuine bugs — callers need to tell them apart programmatically.

## One Failure Semantics, Cleanup Always Runs

For an operation over many independent items, commit to one of:

```rust
// Best-effort: warn per failure, succeed overall
for item in &items {
    if let Err(e) = process(item) {
        warn!("skipping {item}: {e}");
    }
}
cleanup();
Ok(())

// Fail-fast with guaranteed cleanup: store the result, propagate after
let mut result = Ok(());
for item in &items {
    if let Err(e) = process(item) {
        result = Err(e);
        break;
    }
}
cleanup(); // always runs
result
```

Never warn per item *and* fail at the end when everything failed — a caller sees warnings followed by a surprising nonzero exit.

## Don't Conflate EOF with Error

`read(...).unwrap_or(0) == 0` makes an I/O error indistinguishable from clean end-of-file — the error path silently becomes "we're done". Match the `Result`; if treating error as EOF is genuinely intended, say so in a comment at the site.

## No Unattended Retry Loops

A failed step is the user's cue to intervene. Don't spin forever, and don't add silent auto-retry behind a default-on flag without an obvious way to disable it. Bounded retries with backoff are fine when the failure mode is known-transient — name the bound in config, not a magic constant.
