# Error Handling

Load when code defines an error type, propagates or wraps an error, or chooses between panic, fail-fast and best-effort.
Covers `thiserror`, `anyhow`/`eyre`, `?` and failure semantics; logging an error is in `observability.md`.

## Panic or Result

- Anticipated runtime failure (bad input, I/O, a missing value): return `Result`. Panic only for a bug the code cannot recover from.
- No `.unwrap()` outside tests. `.expect(..)` only where the specification makes failure impossible, never on a caller-supplied value and never for a failure the function can return as its error (use `?`). `clippy::unwrap_used`
- Where a panic is right, use `expect` and say what should have held: `.expect("PORT should be set by the launcher")`.
- Never drop a `Result` to silence the warning (`let _ = write_config(..);`): handle it or propagate it. The one accepted discard is best-effort cleanup inside `Drop`. `clippy::let_underscore_must_use` (it flags a `Drop` discard written `let _ =` too, and `lints.md`'s block adds `let_underscore_drop`: write it `if let Err(_e) = self.close() {}`)
- Never `Err(_) => panic!(..)`: bind the error, then report or propagate it. `clippy::match_wild_err_arm`
- Index with `.get(i)` when the index comes from input; `buf[i]` panics out of range. `clippy::indexing_slicing`
- A constant-true `assert!` checks nothing: delete it. A constant-false one that must abort is `panic!("why")`; a branch the types rule out is `unreachable!("why")`. `clippy::assertions_on_constants`
- `panic::catch_unwind` only isolates a panic at an FFI or thread-pool boundary, never as a try/catch: not every panic unwinds, and a failure belongs in `Result`. A closure that captures `&mut` state fails its `UnwindSafe` bound (E0277): audit it, then wrap it in `panic::AssertUnwindSafe(..)`.
- A panic hook takes `&PanicHookInfo` (1.81); `std::panic::PanicInfo` there is deprecated since 1.82. Write `panic::set_hook(Box::new(|info| ..))` and let inference name the type.
- Input-dependent precondition in a fallible function: `ensure!` (anyhow) or an early `return Err(..)`, never `assert!`:

```rust
// fragment
fn check(user: usize) -> anyhow::Result<()> {
    // WRONG: assert!(user == 0, "only user 0 is allowed");  panics on bad input
    anyhow::ensure!(user == 0, "only user 0 is allowed");
    Ok(())
}
```

## Pick the Error Type

| Code | Error type |
|---|---|
| Library crate, public API | its own type (`thiserror` derive or a manual impl). Never `anyhow::Result`, `Box<dyn Error>`, `Result<T, ()>` (`clippy::result_unit_err`) or `Err("failed".to_string())` |
| Application or binary | `anyhow::Result<T>`, not `Result<T, Box<dyn std::error::Error>>`. Domain errors stay `thiserror` types; `?` converts them |
| `fn main` | `fn main() -> anyhow::Result<()>`: a failure prints its context chain |
| Any `Box<dyn Error>` the code does write (never in a library's public API) | `Box<dyn Error + Send + Sync + 'static>` |

## Designing Error Types

```rust
// fragment
#[derive(Debug, thiserror::Error)]
enum OrderError {
    #[error("item {item_id} is out of stock")]
    OutOfStock { item_id: u64 },
    #[error("quantity {qty} is over the limit {}", .limits.max)]
    OverLimit { qty: u32, limits: Limits },
    #[error("payment failed: {reason}")]
    PaymentFailed { reason: String },
    #[error("database error")]
    Database(#[from] sqlx::Error),
    #[error(transparent)]
    Other(#[from] anyhow::Error),
}
```

| Wrong | Right | Why |
|---|---|---|
| a variant with no `#[error("...")]` | `#[error("...")]` on every variant or on the type, or a manual `Display` | the derive does not compile: `Display` is missing (E0277) |
| `#[error("key {}", self.0)]` | `#[error("key {0}")]`; extra arguments as `.0` / `.field` | field access through `self` does not compile |
| `Io(#[from] io::Error, String)` | `Io(#[from] io::Error)` | a `#[from]` variant holds the source alone (a `Backtrace` field beside it needs a nightly compiler) |
| the cause in a field named `inner` or `cause` | name the field `source`, or mark it `#[source]` | otherwise `source()` returns `None` and the chain stops |
| `#[from] #[source]` on one field | `#[from]` alone | `#[from]` already implies `#[source]` |
| `#[error("unknown error")] Other(#[from] anyhow::Error)` | `#[error(transparent)]` on the catch-all | forwards `Display` and `source` to the inner error |
| `#[source] source: String` | a source field whose type implements `Error` or dereferences to `dyn Error` | any other source type fails the derive |

- Error messages: lowercase, no trailing punctuation (`"unable to read config at {path}"`).
- Show the cause in `Display` or return it from `source()`, never both: a chain printer would repeat it.
- Error types are `Send + Sync + 'static`: no `Rc` or `RefCell` field. `?` into `anyhow::Error` requires all three.
- Manual impl: `#[derive(Debug)]`, `impl Display`, then `impl std::error::Error for E {}`. Never implement or call `description()` (deprecated since 1.42).
- Convert low-level errors into domain errors at module boundaries (`#[from]` impls or `.map_err`), so callers match on meaning, not on plumbing. A repeated `.map_err(|e| MyError::Io(e))?` becomes one `From` impl plus a bare `?`.
- One god-enum with 50 variants serves nobody: split per subsystem.
- Keep an internal `ErrorKind` enum `pub(crate)`; expose `is_timeout()`-style predicate methods instead.
- A fallible function that consumes its argument returns it inside the error (`SendError(value)`), so the caller can retry without cloning.
- Give "bad input, retry" failures a distinct type or variant from genuine bugs: callers need to tell them apart programmatically.
- Log at the point of *handling*, not creation. An error logged when constructed and again when handled shows up twice; one logged only at creation may never surface at all. The eager-log form `inspect_err(|_| error!(...))?` logs the failure at the call site, then propagates the raw error, splitting the path from its cause and reporting it twice; `.context(...)`/`.with_context(...)` (anyhow) or `.wrap_err(...)`/`.wrap_err_with(...)` (eyre) puts the context on the error chain so the handler reports it once.

## Pick the Right Helper at the Boundary

| Situation | Helper |
|---|---|
| Error type unifies (a `From` impl exists) | `?` alone |
| Type doesn't unify | `.map_err(...)?` |
| `Option` needs to become an error | `.ok_or(...)` / `.ok_or_else(...)` (anyhow: `.context(...)`, eyre: `.ok_or_eyre(...)`) |
| Add context to an existing chain | anyhow: `.context("...")` / `.with_context(...)` (lazy); eyre: `.wrap_err("...")` / `.wrap_err_with(...)`. anyhow has no `wrap_err` |
| Unrecoverable with a fully-formed message | `bail!("...")`; prefer it over `return Err(anyhow!(...))`, but don't replace `?` or `.ok_or_else` with it |

Add context where the caller loses information, not on every hop. Build a formatted message lazily, and pass an error value, never its text:

```rust
// fragment
use anyhow::Context; // brings `.context` / `.with_context` into scope, on `Result` and on `Option`

// WRONG: fs::read(&path).context(format!("failed to read config at {}", path.display()))?;  formats on every success
fs::read(&path).with_context(|| format!("failed to read config at {}", path.display()))?;

// WRONG: return Err(anyhow!(format!("recursion limit exceeded: {}", e)));  flattens the cause chain into text
bail!(e); // one error value keeps its `source()` chain
```

`?` and `return` inside a closure or an `async` block act on that block only: the error becomes the block's value, the enclosing function keeps running. `break` and `continue` cannot branch out of an `async` block to a loop around it.

## Inspecting and Printing Errors

Classify a failure by its type, never by its message, and look through every layer of context:

```rust
// fragment
// WRONG: if error.to_string().contains("censored") { .. }   breaks when a message changes
// WRONG: error.downcast_ref::<io::Error>()                  checks one layer only
pub fn underlying_io_error_kind(error: &anyhow::Error) -> Option<io::ErrorKind> {
    for cause in error.chain() {
        if let Some(io_error) = cause.downcast_ref::<io::Error>() {
            return Some(io_error.kind());
        }
    }
    None
}
```

A typed error has no `chain()`: walk `Error::source()` the same way.

```rust
// fragment
eprintln!("ERROR: {}", err);   // WRONG: prints the outermost context only
eprintln!("ERROR: {:#}", err); // context plus every cause, inline
eprintln!("ERROR: {:?}", err); // causes plus the captured backtrace
```

Where the crate turns on `clippy::use_debug`, it fires on the `{:?}` line: put `#[expect(clippy::use_debug, reason = "prints the error chain")]` on that statement (1.81+); below 1.81, `#[allow(clippy::use_debug)]`.

An error captures a backtrace only when `RUST_LIB_BACKTRACE` is set to any value but `0`, or, while that variable is unset, `RUST_BACKTRACE` is (which also turns on panic backtraces); anyhow captures one on Rust 1.65+.

## Bind Once, Never Check-Then-Access

Checking a `Result`/`Option` and then accessing it separately splits one decision into two places that can drift:

```rust
// fragment
// BAD: check and access are separate; the unwrap is a landmine
if config.is_err() {
    eprintln!("no config found, using defaults");
    return Ok(Settings::default());
}
let config = config.unwrap();

// GOOD: one match binds and decides
let config = match config {
    Err(_) => {
        eprintln!("no config found, using defaults");
        return Ok(Settings::default());
    }
    Ok(c) => c,
};
```

Same rule when the two branches produce different values: return a tuple from one `match` instead of probing with `.is_ok()` and re-deriving state later.

## Early-Return Guards Over Smuggled Conditions

A precondition belongs in a visible guard, not inside a combinator:

```rust
// fragment
// BAD: the business rule hides inside a filter
let session = state.session().as_ref().filter(|_| config.keep_alive())?.clone();

// GOOD: the rule reads as a rule
if !config.keep_alive() {
    return None;
}
let session = state.session()?.clone();
```

## One Failure Semantics, Cleanup Always Runs

For an operation over many independent items, commit to one of:

```rust
// fragment
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

Never warn per item *and* fail at the end when everything failed: a caller sees warnings followed by a surprising nonzero exit.

## Don't Conflate EOF with Error

`read(...).unwrap_or(0) == 0` makes an I/O error indistinguishable from clean end-of-file: the error path silently becomes "we're done". Match the `Result`; if treating error as EOF is genuinely intended, say so in a comment at the site.

## No Unattended Retry Loops

A failed step is the end user's cue to intervene. Don't spin forever, and don't add silent auto-retry behind a default-on flag without an obvious way to disable it. Bounded retries with backoff are fine when the failure mode is known-transient: name the bound in config, not a magic constant.

## Checklist

- [ ] No `.unwrap()` outside tests; no `.expect(..)`, `assert!` or `buf[i]` on an input-derived value; no `Result` dropped with `let _ =`, and none discarded except by `if let Err(_e) = .. {}` where the failure needs no action (a `Drop` impl's best-effort cleanup, a oneshot send whose receiver may be gone, a fuzz target's call); no `catch_unwind` used as try/catch.
- [ ] Library signatures return a concrete error type; binaries return `anyhow::Result`.
- [ ] Every `thiserror` variant has `#[error]`; each `#[from]` variant holds only its source; a cause field is named `source`.
- [ ] Messages are lowercase with no trailing punctuation and do not repeat the `source()` error.
- [ ] Formatted context uses `.with_context(|| ..)`; no `anyhow!("..{e}")` flattening an error to text.
- [ ] No `to_string().contains(..)` to classify an error; the top level prints with `{:#}` or `{:?}`.
- [ ] Each `Result` is matched once: no `is_err()` followed by `unwrap()`, no `unwrap_or(0)` on a read.
- [ ] A batch operation has one failure semantics, its cleanup runs on every path, and every retry is bounded.
