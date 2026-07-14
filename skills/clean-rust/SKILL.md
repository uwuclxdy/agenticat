---
name: clean-rust
description: "Clean, idiomatic Rust conventions: naming, error handling, ownership, iterators, traits, async, unsafe, testing, performance, and edition 2024. Use when writing, reviewing, or refactoring any Rust code, and whenever clippy, cargo, 'rust best practices', or 'idiomatic rust' come up."
metadata:
  author: uwuclxdy
  version: "1.0"
---

# Clean Rust

Rust-specific conventions for writing, reviewing, and refactoring. The core rules below always apply. Load the one reference file matching the task's domain; don't load them all.

If the `clean-code` skill is installed, its language-agnostic principles (function size, naming hygiene, comment discipline) still apply — but where generic advice conflicts with Rust idiom, this skill wins. Classic examples: "prefer exceptions over error codes" maps to `Result`, never panics; "replace switch with polymorphism" maps to exhaustive `match`, which in Rust is a feature, not a smell.

| Task touches | File |
|---|---|
| Error types, propagation helpers, failure semantics, retries | `references/error-handling.md` |
| async/await, tokio, `select!`, channels, spawned child processes | `references/async.md` |
| Threads, atomics, lock ordering, drop order | `references/concurrency.md` |
| Public API shape, builders, newtypes, typestate, serde | `references/api-design.md` |
| Any `unsafe` block, FFI, raw pointers, exported symbols | `references/unsafe.md` |
| Writing tests or debugging test infrastructure | `references/testing.md` |
| Hot paths, allocations, string building, hasher choice | `references/performance.md` |
| Edition 2024 migration or 2024-specific behavior changes | `references/edition-2024.md` |

## Errors

- `Result` + `?` everywhere; no `.unwrap()`/`.expect()` outside tests and compile-time constants (`LazyLock<Regex>` init). The rare justified `expect` carries a message naming the invariant that makes it safe.
- No sentinel returns (`-1`, `""`) for failure. `Option<T>` for absence that isn't an error.
- `thiserror` for library errors (callers can match), `anyhow`/`eyre` at the application boundary. Never `Box<dyn Error>` or `String` as a library error type.
- Bind a `Result` once with `match`/`if let`/`let-else` — never `.is_ok()` followed by separate access or a downstream `.unwrap()`.
- Pick one failure semantics per operation: best-effort (warn per item, `Ok(())` at end) or fail-fast (propagate first error). Never warn-per-item and then fail at the end — that surprises exit-code consumers.

## Ownership & Borrowing

- Borrow by default: `&str`, `&[T]`, `impl AsRef<Path>` for read-only params. Never `&String` or `&Vec<T>`.
- Every `.clone()` is an explicit cost — never one to silence the borrow checker. `Cow<'_, str>` when allocation is conditional; `Arc<T>` for shared ownership across threads.
- Unsigned types for counts, ports, sizes: `jobs: u32`, not `jobs: i32`. The type documents the constraint.
- Let lifetime elision work. A struct with 3+ lifetime params is a design smell — consider owned data.

## Naming

RFC 430 casing (`snake_case` items, `CamelCase` types, `SCREAMING_SNAKE_CASE` consts) plus semantic method prefixes:

| Prefix | Contract |
|---|---|
| `into_` | consumes `self`, returns owned |
| `as_` | cheap borrowed view, no allocation |
| `to_` | possibly expensive, may allocate |
| `try_` | fallible variant returning `Result` |
| `is_` / `has_` | boolean query |
| `with_` | builder-style configuration |
| `_mut` suffix | mutable variant |

- No `get_` for plain field access — `fn name(&self) -> &str`. Reserve `get` for fallible lookups (`get(key) -> Option<&V>`).
- Concrete names: `cmd` not `executor`, `typ` not `ty`. Single letters only in tiny scopes.
- Names must not lie about the data: no `_list` suffix on a `HashMap`, no `owned_` on a `&str`.
- Wrap semantically distinct primitives in newtypes (`UserId(u64)`, `OrderId(u64)`) so the compiler catches argument swaps.

## Control Flow & Iterators

- `match` on enums stays exhaustive: no `_ => {}` arm in dispatchers. Spell out every variant — an empty arm with a comment beats a wildcard that silently swallows the next variant added.
- `let-else` for guard-style early returns; it reads linearly where `.ok().and_then(...).is_some_and(...)` chains don't.
- Iterator chains for value-producing pipelines. When the result is discarded (`let _ = ...`), the chain is control flow in disguise — write the `for` loop.
- Return `impl Iterator<Item = T>` when callers consume sequentially; premature `.collect()` allocates for nothing.
- Group one logical filter into one `.filter_map()` closure (using `?` and early `return None`) instead of fragmented `.filter_map().filter().filter_map()` chains.
- Don't reimplement the standard library: `split_once('=')` over `.splitn(2, '=').collect()`, `unwrap_or_default()` over `unwrap_or_else(|| T::default())`.
- One fluent chain over three named single-use intermediates; declare variables next to first use, not at the top of the function.

## Types & Traits

- Derive liberally where semantically correct: `Debug` on effectively every public type; `Clone`, `PartialEq`, `Eq`, `Hash` as meaning allows (if `a == b` then `hash(a) == hash(b)` must hold); `Default` when a meaningful empty value exists.
- `dyn Trait` only for genuinely open sets (plugins, user extension). A closed set of a few known types is an enum — simpler and faster.
- Typed `#[derive(Deserialize)]` structs over `serde_json::Value` indexing: field typos become compile errors instead of silent runtime `None`s.
- `impl Trait` in argument position for simple bounds; `where` clauses when signatures grow. Don't make a function generic when one concrete type is ever used.

## Platform & cfg

- Short forms: `#[cfg(windows)]`, `#[cfg(unix)]` — not `#[cfg(target_os = "windows")]`.
- No redundant `#[cfg]` inside a module that's already cfg-gated at its `mod` declaration.
- Helpers used on only one platform must be gated (or `#[allow(unused)]`) so every target compiles warning-free — cross-platform CI fails on the platform that doesn't use them.

## Strings & IO

- `static RE: LazyLock<Regex>` for compiled-once regexes; never compile inside a loop or per call.
- ASCII character classes (`[a-zA-Z0-9]`) over POSIX `[[:alnum:]]` — the latter carries locale baggage.
- Inline format args: `debug!("found {name:?}")`, not `debug!("found {:?}", name)`.
- Forward child-process output with `io::stdout().write_all(&output.stdout)?` — `println!` mangles encoding and panics on broken pipes.

## Modules & Visibility

- Private by default; `pub(crate)` for internal sharing. Fields with invariants stay private behind methods.
- Organize by domain (`order/`, `user/`), not by kind (`models/`, `services/`).
- `pub` items before private helpers in a file; `use` statements at the top, never inside functions.

## Comments & Docs

- Comments explain *why* — hidden constraints, upstream bug links, invariants the reader can't see. Never *what* the next line does. Delete commented-out code; git remembers.
- Public APIs get `///` docs with `# Examples` (runnable), plus `# Errors`, `# Panics`, `# Safety` when applicable.
- Every lint suppression is justified: `#[expect(lint, reason = "...")]` over bare `#[allow]`.
- Non-obvious string input formats get documented above the signature (`// accepts "name", "name:tag", or "ns/name:tag"`).

## Tooling

- `cargo fmt` and `cargo clippy` clean in CI, no exceptions. Fix warnings; don't blanket-suppress.
- Libraries: `#![warn(clippy::pedantic)]` and selectively allow, never a blanket `#![allow(clippy::all)]`. Consider `unwrap_used`/`expect_used` at `warn` (see `references/testing.md` for keeping test code exempt).
- No formatting-only churn in feature PRs — the diff should match the description.

## Unsafe

Default posture: `unsafe_code = "forbid"` until a concrete need exists. When it does exist, every block carries a `// SAFETY:` comment and stays minimal — full discipline in `references/unsafe.md`.

## Pre-Submit Checklist

- [ ] No `.unwrap()` outside tests/compile-time constants; no `.is_ok()` + separate access
- [ ] Failure semantics consistent: best-effort or fail-fast, not mixed; cleanup always runs
- [ ] Borrows by default; no `&String`/`&Vec<T>`; every `.clone()` intentional
- [ ] Method prefixes honest (`into_`/`as_`/`to_`/`try_`); newtypes for swappable primitives
- [ ] No `_ => {}` in enum dispatchers; `let-else` over combinator gymnastics
- [ ] `impl Iterator` over premature `Vec`; no stdlib reimplementations
- [ ] Typed `Deserialize` over `Value`; `dyn` only for open sets
- [ ] `#[cfg(windows)]` short form; single-platform helpers gated for all-target CI
- [ ] `LazyLock` regexes; inline format args; `write_all` for child output
- [ ] Comments say why; suppressions carry `reason`; no commented-out code
- [ ] fmt + clippy clean; no formatting churn outside the change
