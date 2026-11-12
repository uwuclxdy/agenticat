---
name: clean-rust
description: "Idiomatic Rust 2024 rules: ownership, error handling, async, unsafe, traits, iterators, clippy."
when_to_use: "Use when writing, reviewing, or linting Rust. For language-agnostic style, `clean-code`."
metadata:
  author: uwuclxdy
  version: "1.17"
---

# Clean Rust

The core rules below always apply. Load each reference file whose row matches the task; don't load them all.

If the `clean-code` skill is installed, its language-agnostic principles still apply. Where generic advice conflicts with Rust idiom, this skill wins.

## Process

1. Read `edition` and `rust-version` in `Cargo.toml` first. Write the newest idiom they compile. Never raise either for a newer form unless the task asks. A stale form in code you touch is a defect.
2. Before calling an API this repo does not already use, confirm it exists and check its signature: the crate's docs, its source in the cargo registry, or the std docs. A method name from memory is a guess.
3. Compile early and often: `cargo check` after each coherent change. Read the first error whole. Apply the compiler's own suggestion before trying alternatives.
4. When the borrow checker rejects code, restructure ownership first: borrow, split the borrow, or move. Reach for `.clone()`, `Rc<RefCell<_>>` or `Arc<Mutex<_>>` only after that fails.
5. Before reporting done, run each loaded reference's checklist and the pre-submit checklist below over your own diff.

## Stale Forms

Write the Current form when the crate's `rust-version` and `edition` reach Since; on an older one keep the Stale form. Never call a `#[deprecated]` item: use the replacement its note names. Full table: `references/modern-rust.md`.

| Stale | Current | Since |
|---|---|---|
| `lazy_static!`, `once_cell::sync::Lazy` | `static X: LazyLock<T> = LazyLock::new(init);` | 1.80 |
| `println!("{}", x)` | `println!("{x}")` | 1.58, `clippy::uninlined_format_args` 1.66 |
| `big as u8` to narrow | `u8::try_from(big)?` | 1.34, `clippy::cast_possible_truncation` |
| `match o { Some(x) => x, None => return }` | `let Some(x) = o else { return };` | 1.65, `clippy::manual_let_else` 1.67 |
| `if let Some(x) = a { if x > 0 { .. } }` | `if let Some(x) = a && x > 0 { .. }` | 1.88 and edition 2024 |
| `#[allow(lint)]` | `#[expect(lint, reason = "..")]` | 1.81, `clippy::allow_attributes` |
| `m.contains_key(&k)` then `m.insert(k, v)` | `m.entry(k).or_insert(v)` | always, `clippy::map_entry` |
| `std::i32::MAX`, `std::u8::MAX` | `i32::MAX`, `u8::MAX` | 1.43; old form deprecated 1.99 |
| hand-written `impl Default` for an enum | `#[derive(Default)]` and `#[default]` on one unit variant | 1.62 |
| `edition = "2021"` in a new crate | `edition = "2024"` | 1.85 |
| `fn gen()`, `let gen = ..`, `x.gen()` | another name, or `r#gen`: `x.r#gen()` | keyword in edition 2024 |
| `env::set_var(k, v)` | `cmd.env(k, v)` for a child; under `forbid`, pass the value in (tests: `references/testing.md`); else `unsafe { env::set_var(k, v) }`, single-threaded (always sound on Windows) | `unsafe` in edition 2024 |
| `static mut X` as shared state | `static X: AtomicU32`, `Mutex<T>` or `LazyLock<T>` | always; `&X` is an error in edition 2024, `static_mut_refs` |
| `#[no_mangle]`, `extern "C" { .. }` | `#[unsafe(no_mangle)]`, `unsafe extern "C" { .. }` | 1.82; required in edition 2024 |
| unsafe calls bare in an `unsafe fn` body | each in its own `unsafe { .. }` block | edition 2024, `unsafe_op_in_unsafe_fn` |

## Routing

| Task touches | File |
|---|---|
| Any Rust change | this `SKILL.md`, already loaded |
| A stale form, a deprecation or edition lint, an API newer than `rust-version` | `references/modern-rust.md` |
| Borrow-checker errors, lifetimes, `Box`/`Rc`/`Arc`, `Cell`/`RefCell`, drop order | `references/ownership.md` |
| Enums and patterns, trait design, generics vs `dyn`, `From`/`TryFrom`, `Ord`/`Hash` impls | `references/types-traits.md` |
| `Option`/`Result` methods, iterator chains, strings, slices, `Vec`, maps, sets, integer arithmetic and casts | `references/std-toolbox.md` |
| Files, stdin/stdout, paths, child processes, env vars, process exit, time | `references/io-process.md` |
| Error types, propagating or wrapping an error, panic vs fail-fast vs best-effort | `references/error-handling.md` |
| Logging, `tracing` events and spans, instrumenting a function, subscriber setup | `references/observability.md` |
| Public API shape: naming, signatures, constructors, builders, newtypes, typestate, breaking changes | `references/api-design.md` |
| `async`/`.await`, tokio tasks, `select!`, channels, timers, async IO, shutdown | `references/async.md` |
| Threads, `Arc`, locks, `Condvar`, atomics, `mpsc`, lazy statics, `rayon` | `references/concurrency.md` |
| A crate on or moving to `edition = "2024"`; 2021-era code that breaks or changes behavior there | `references/edition-2024.md` |
| Any `unsafe`, raw pointers, `#[repr(..)]`, `transmute`, `MaybeUninit`, `unsafe impl` | `references/unsafe.md` |
| An `extern` block or `extern "C"` fn, `#[unsafe(no_mangle)]`/`export_name`, `CString`/`CStr`/C buffers, a `#[repr(C)]` type passed to C, a callback or pointer C holds, `*-sys` bindings, a panic crossing to C | `references/ffi.md` |
| Secrets on disk, encrypting or hashing a credential, a new dependency, arithmetic or indexing on untrusted input | `references/security.md` |
| Hot-path code (tight loops, per-request handlers), hasher choice, benchmarks, build profiles | `references/performance.md` |
| Writing, reviewing or debugging tests; a nextest test group; a first fuzz target | `references/testing.md` |
| nextest profiles, overrides, retries, timeouts, selection; `cargo nextest` in CI; fuzz oracles, fuzz CI | `references/test-tooling.md` |
| `macro_rules!` macros, exporting a macro, proc macros | `references/macros.md` |
| Doc comments, doctests, doc links, ordinary comments, code and `Cargo.toml` layout | `references/docs.md` |
| A CLI parsed with clap derive | `references/cli.md` |
| serde derive, `#[serde(..)]` attributes, wire formats | `references/serde.md` |
| Lint levels, the `[lints]` table, `clippy.toml`, suppressing a lint | `references/lints.md` |

## Errors

- `Result` + `?` everywhere; no `.unwrap()` outside tests (`clippy::unwrap_used`). Where failure can only be a bug, `.expect("..")` naming the invariant: `m.lock().expect("lock poisoned")`, one-time init of a hand-audited literal (`LazyLock<Regex>` on a fixed pattern).
- Never drop a `Result`: a fallible call left as a bare statement loses the error (`unused_must_use`).
- No sentinel returns (`-1`, `""`) for failure. `Option<T>` for absence that isn't an error.
- `thiserror` for library errors (callers can match), `anyhow`/`eyre` at the application boundary. Never `Box<dyn Error>` or `String` as a library error type.
- Bind a `Result` once with `match`/`if let`/`let-else`, never `.is_ok()` followed by separate access or a downstream `.unwrap()`.
- Pick one failure semantics per operation: best-effort (warn per item, `Ok(())` at end) or fail-fast (propagate first error). Never warn-per-item and then fail at the end.

## Ownership & Borrowing

- Borrow by default: `&str`, `&[T]`, `impl AsRef<Path>` for read-only params. Never `&String` or `&Vec<T>` (`clippy::ptr_arg`).
- A `String`, `Vec` or other owning value moves on assignment or a by-value pass: pass `&x` when the caller still needs `x`.
- One `&mut` or any number of `&` to a value at a time: finish with the earlier borrow before taking the next.
- Every `.clone()` is an explicit cost, never one to silence the borrow checker. `Cow<'_, str>` when allocation is conditional; `Arc<T>` for shared ownership across threads.
- Unsigned types for counts, ports, sizes: `jobs: u32`, not `jobs: i32`.
- Let lifetime elision work. A struct with 3+ lifetime params is a design smell: consider owned data.

## Naming

RFC 430 casing (`snake_case` items, `UpperCamelCase` types, `SCREAMING_SNAKE_CASE` consts) plus semantic method prefixes:

| Prefix | Contract |
|---|---|
| `into_` | consumes `self`, returns owned |
| `as_` | cheap borrowed view, no allocation |
| `to_` | possibly expensive, may allocate |
| `try_` | fallible variant returning `Result` |
| `is_` / `has_` | boolean query |
| `with_` | constructor taking extra detail (`Vec::with_capacity`); a builder is its own type |
| `_mut` | mutable variant (`get_mut`, `iter_mut`); `as_mut_slice`, not `as_slice_mut` |

- No `get_` for plain field access: `fn name(&self) -> &str`. `get` names the one obvious value (`Cell::get`) or a checked lookup (`get(key) -> Option<&V>`).
- Concrete names: `cmd` not `executor`, `typ` not `ty`. Single letters only in tiny scopes.
- Names must not lie about the data: no `_list` suffix on a `HashMap`, no `owned_` on a `&str`.
- Wrap semantically distinct primitives in newtypes (`UserId(u64)`, `OrderId(u64)`).

## Control Flow & Iterators

- `match` on enums stays exhaustive: no `_ => {}` arm in dispatchers. Spell out every variant; an unused one gets an empty arm with a comment.
- `let-else` for guard-style early returns; it reads linearly where `.ok().and_then(...).is_some_and(...)` chains don't.
- Iterator chains for value-producing pipelines. When the result is discarded (`let _ = ...`), the chain is control flow in disguise; write the `for` loop.
- Return `impl Iterator<Item = T>` when callers consume sequentially.
- Group one logical filter into one `.filter_map()` closure (using `?` and early `return None`) instead of fragmented `.filter_map().filter().filter_map()` chains.
- Don't reimplement the standard library: `split_once('=')` over `.splitn(2, '=').collect()`, `unwrap_or_default()` over `unwrap_or_else(|| T::default())`. Don't reimplement an in-scope codebase helper either: when a type or signature error points at a call to one, let its return type set your signature (its `PathBuf` where the caller wanted a name); never copy its body. Reuse in this order: an in-scope helper, an existing generic config knob, a sibling-code precedent, the standard library, a well-known crate, then hand-rolled; a hand-rolled fallback is fine only when the standard option has a concrete documented limit, and carries an in-code comment naming it.
- One fluent chain over three named single-use intermediates; declare variables next to first use, not at the top of the function.
- Prefer chained builder calls over `let mut` named variables for linear configuration sequences: with two similar blocks in one function, copy-paste produces `first.configure()` where `second.configure()` was meant, and the compiler accepts it.

## Numbers & Indexing

- Arithmetic that can overflow says what it means: `checked_add`, `wrapping_add`, `saturating_add`. A bare `+` panics with `overflow-checks` on (dev), else wraps.
- `v.get(i)`, `v.first()`, `map.get(&k)` when the index or key may be absent; `v[i]` and `map[&k]` panic.

## Types & Traits

- Derive liberally where semantically correct: `Debug` on effectively every public type; `Clone`, `PartialEq`, `Eq`, `Hash` as meaning allows (if `a == b` then `hash(a) == hash(b)` must hold); `Default` when a meaningful empty value exists.
- Derive `PartialEq, Eq, PartialOrd, Ord` together; never pair a derived one with a hand-written one.
- `dyn Trait` only for genuinely open sets (plugins, user extension). A closed set of a few known types is an enum: simpler and faster.
- Typed `#[derive(Deserialize)]` structs over `serde_json::Value` indexing: field typos become compile errors.
- `impl Trait` in argument position for simple bounds; `where` clauses when signatures grow. Don't make a function generic when one concrete type is ever used.

## Platform & `cfg`

- `#[cfg(unix)]`/`#[cfg(windows)]` gate a whole target family: `unix` is true on Linux, macOS, iOS and the BSDs. Write `#[cfg(target_os = "linux")]` only when one OS is meant.
- No redundant `#[cfg]` inside a module that's already cfg-gated at its `mod` declaration.
- Helpers used on only one platform must be gated (or carry the `#[allow]` below) so every target compiles warning-free.
- An `#[allow(dead_code)]`/`#[allow(unused)]` on an item whose only callers sit in `cfg`-gated modules is load-bearing; `pub` does not exempt an item from `dead_code` when a private module hides it; a sibling's same-file allow is the precedent signal. Keep it as `#[allow(dead_code, clippy::allow_attributes, reason = "..")]`; below 1.81, `#[allow(dead_code)]`: `#[expect(dead_code)]` fires `unfulfilled_lint_expectations` on the platforms where the item is live.

## Strings & IO

- `static RE: LazyLock<Regex>` for compiled-once regexes; never compile inside a loop or per call.
- ASCII character classes (`[a-zA-Z0-9]`) over POSIX `[[:alnum:]]`.
- `s.len()` counts bytes, not characters. Characters: `s.chars().count()`; byte offsets for slicing: `s.char_indices()`.
- Never truncate a string at a raw byte index. `&s[..n]` panics mid-codepoint on non-ASCII; the "safe" `s.get(..n).unwrap_or(s)` (on `s: &str`) is worse: it returns the **whole** string when `n` lands mid-codepoint, so oversize input escapes the cap. Use `&s[..s.floor_char_boundary(n)]` (1.91) or walk `char_indices()`.

## Modules & Visibility

- A new module file compiles only once its parent declares it: `mod utils;` in `lib.rs`, `main.rs` or the parent module. A target file (`tests/*.rs`, `benches/*.rs`, `examples/*.rs`, `src/bin/*.rs`) needs none. Items other modules call need `pub` or `pub(crate)`.
- Private by default; `pub(crate)` for internal sharing. Fields with invariants stay private behind methods.
- Organize by domain (`order/`, `user/`), not by kind (`models/`, `services/`).
- `pub` items before private helpers in a file; `use` statements at the top, never inside functions.

## Comments & Docs

- Comments explain *why*: hidden constraints, upstream bug links, invariants the reader can't see. Never *what* the next line does. Delete commented-out code.
- Public APIs get `///` docs with `# Examples` (runnable), plus `# Errors`, `# Panics`, `# Safety` when applicable.

## Tooling

- `cargo fmt` and `cargo clippy` clean in CI, no exceptions. Fix warnings; don't blanket-suppress.
- Lint levels live in the `[lints]` table of `Cargo.toml` (1.74), not in `#![warn(..)]` attributes; the curated set is `references/lints.md`. Never a blanket `#![allow(clippy::all)]`.
- No formatting-only churn in feature PRs: the diff should match the description.
- One PR = one focused change; formatting fixes, new workflows, and features travel separately.

## Unsafe

Default posture: `unsafe_code = "forbid"` until a concrete need exists. When it does exist, every block carries a `// SAFETY:` comment and stays minimal; full discipline in `references/unsafe.md`.

## Pre-Submit Checklist

- [ ] Diff: no `#[deprecated]` call; no Stale form where `edition`/`rust-version` reach Since
- [ ] Each newly used API checked against docs or source; the repo's gate passes
- [ ] No `.unwrap()` outside tests; each `.expect(..)` names its invariant; no `.is_ok()` + separate access; no dropped `Result`
- [ ] Test expectations hand-computed, never recomputed by the code under test; no re-pinned paths
- [ ] Failure semantics consistent: best-effort or fail-fast, not mixed; cleanup always runs
- [ ] Borrows by default; no `&String`/`&Vec<T>`; every `.clone()` intentional
- [ ] Method prefixes honest (`into_`/`as_`/`to_`/`try_`); newtypes for swappable primitives
- [ ] No `_ => {}` in enum dispatchers; `let-else` over combinator gymnastics
- [ ] `impl Iterator` over premature `Vec`; no reimplementations of stdlib or in-scope helpers
- [ ] No overflow-prone bare arithmetic, narrowing `as`, `[]` on a maybe-absent index, or string cut at a raw byte index
- [ ] Typed `Deserialize` over `Value`; `dyn` only for open sets
- [ ] `unix`/`windows` vs `target_os` chosen on purpose; single-platform helpers gated for all-target CI
- [ ] `LazyLock` regexes; inline format args; new module files declared with `mod`
- [ ] Comments say why; suppressions carry `reason`; no commented-out code
- [ ] fmt + clippy clean; no formatting churn outside the change
- [ ] One focused change per PR; breaking changes keep the legacy path, removal milestoned
