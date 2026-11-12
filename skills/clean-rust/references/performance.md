# Performance

Load for hot-path code (tight loops, per-request handlers, per-frame renders, per-chunk parsers), for a benchmark, and for a build profile.
Cold paths (startup, error branches) can ignore all of it but Clippy's perf lints and the hasher rule. For anything beyond these defaults: profile first; a switch that doesn't show up in profiler output isn't worth its churn.

## Measure First

- Measure, profile and ship `--release` builds only. A dev build is unoptimized and can run 10-100x slower: a number taken on one means nothing.
- Find hot code with a profiler, never by reading. Optimize only what it shows hot, and try a better algorithm or data structure before micro-tuning.
- A hot function gets faster by doing less per call, or by being called less (hoist, cache, batch).
- Change one thing per benchmark run, and re-measure after it.
- Follow Clippy's perf lints on cold code too: the suggested form is usually the simpler one.

## Hasher Choice Is a Security Decision

The default `HashMap` hasher (currently SipHash-1-3; std may change the algorithm) is DoS-resistant and slower; swapping it for speed on the wrong map is a vulnerability, not a style choice.

| Hasher | Crate | DoS-resistant | Use when |
|---|---|---|---|
| SipHash-1-3 | std default | yes | keys come from untrusted input |
| aHash | `ahash` | yes (random per-process seed) | general-purpose faster default |
| FxHash | `rustc-hash` | **no** | trusted integer/pointer keys only (internal IDs, caches) |

Never expose a predictable hasher (`FxHashMap`) to user-supplied strings, network data, or untrusted paths: hash flooding turns your map into an O(n²) DoS target.

A custom hasher that overrides `write_u128` for a 128-bit key is tuned for that key type only. Its generic `write` (say `rotate_left(8) ^ b`) leaves the low bits zero for dense `usize`/integer keys, so every small key collides into bucket 0. Verify the low-bit distribution before reusing a hasher across key types.

- Switch hashers only where a profile shows hashing hot, and try more than one: the winner varies by program.
- After a project-wide switch, ban the std type with `clippy::disallowed_types` in `clippy.toml`.

## Parameters and Returns

- A parameter that only reads or mutates elements is `&[T]` / `&mut [T]`, never `&Vec<T>` / `&mut Vec<T>`. Take `&mut Vec<T>` only to grow it. `clippy::ptr_arg`

```rust
// wrong: `fn total(items: &Vec<u32>) -> u32`
fn total(items: &[u32]) -> u32 {
    items.iter().sum()
}
```

- Return `impl Iterator<Item = T>` instead of a collected `Vec<T>` when callers only iterate.
- A generic function instantiated with many types keeps a thin generic shell: move the body into an inner non-generic `fn inner(path: &Path)` and call `inner(path.as_ref())`.

## Allocation Discipline

- `with_capacity(n)` on `Vec`/`String`/`HashMap` whenever the bound is cheap to know; `reserve(n)` on one that already exists.
- `map.entry(key).or_insert_with(...)` over a `contains_key` + `insert` double lookup. `clippy::map_entry`
- `mem::take(&mut field)` / `mem::replace` to move out of `&mut` without cloning.
- Don't `.to_string()`/`.clone()` a `&str` heading into an `Into<Cow<'_, str>>` API: the borrow is zero-alloc.
- Don't `.to_vec()` what already derefs to `[T]` (`Arc<[T]>`, slices) when you only read.
- Reuse one buffer across loop iterations: declare it before the loop and `clear()` it at the end of each pass. The capacity survives.
- `swap_remove(i)` when order does not matter: `remove(i)` shifts the whole tail. Dropping many elements is one `retain(|x| ..)`, never `remove` in a loop or a filter-and-`collect` back into the same variable. `clippy::manual_retain`
- Text that is usually a literal and sometimes built: `Cow<'static, str>`, with `Cow::Borrowed("..")` and `Cow::Owned(format!(..))`.
- `Arc::make_mut(&mut shared)` to mutate shared data: it clones only when the count is above one.
- `Rc` / `Arc` only for a value that is shared. A `clone()` that keeps the code simple stays until a profile shows it hot.
- Values used together share one `Mutex<(A, B)>`; measure: it serializes threads.
- Compute only what gets used: build a log payload inside the enabled check (tracing: `if enabled!(Level::DEBUG) { .. }`), and write `ok_or_else(|| expensive())`, never `ok_or(expensive())`. `clippy::or_fun_call` (nursery: check its hits)
- Box the payload of an outsized enum variant: `Big(Box<Payload>)`. `clippy::large_enum_variant`
- Many short vectors: `SmallVec<[T; N]>` from the `smallvec` crate (literals are `smallvec![]`, never `vec![]`). Benchmark it: each operation is slightly slower than on a `Vec`.
- A buffer held across an `.await` is `vec![0u8; n]`, never a large `[0u8; N]` array: the array is stored inline in every task.
- A byte payload cloned or shared across tasks is `bytes::Bytes`: its `clone()` copies no data, a `Vec<u8>` clone copies all of it.
- An index field in a type instantiated many times is `u32` once the largest count provably fits, cast with `as usize` at use. An oft-copied type stays at or under 128 bytes. Never reorder fields by hand for size: the compiler already does, unless `#[repr(C)]`.

## String Building

- No placeholder, no `format!`: it allocates for nothing. `clippy::useless_format`

```rust
// wrong: `let msg = format!("connection closed");`
let msg = "connection closed";
```

- `format!` only for real formatting (width, padding, precision). Plain concat: `let mut s = n.to_string(); s.push_str(" items");`, measurably faster.
- Append in place with `push_str`; `s = format!("{s}{suffix}")` reallocates the whole string every pass.
- Compile-time constants concat with `concat!(...)` into a `&'static str`: zero runtime cost.
- `eq_ignore_ascii_case` for known-ASCII comparisons; never `.to_lowercase()` per call. `.len()` for ASCII; `.chars().count()` is O(n) and only for possibly-non-ASCII input.
- `LazyLock` (1.80; `OnceLock`, 1.70, on an older `rust-version`) for anything computed once per process: compiled regexes, lookup tables, formatted process metadata.
- Bounded discrete inputs (a `u8` percentage, a status enum) map through a `static TABLE: [&str; N]` returning `&'static str`: no allocation at all.

## Iterator Laziness

Chains do nothing until consumed: build the full pipeline and consume once. `collect()` into an intermediate `Vec` mid-chain defeats the point (see `SKILL.md` on premature collection; `clippy::needless_collect`, nursery: check its hits); `.collect::<Result<Vec<_>, _>>()` at the end short-circuits on the first error without allocating for the failures.

- Feed an existing collection with `v.extend(iter)`, never `v.extend(iter.collect::<Vec<_>>())`.

## Hot Loops

- Iterate instead of indexing: `for x in &v`, never `for i in 0..v.len()` with `v[i]`. Every index is a bounds check. `clippy::needless_range_loop`
- Indexing that must stay: take a slice before the loop (`let s = &v[..];`) and put one `assert!(end <= s.len());` ahead of it, so the per-access checks can go. Keep it `assert!`: `debug_assert!` brings the checks back in release.
- `get_unchecked` is the last resort, after the safe forms fail: see `unsafe.md`.
- `sort_unstable` where equal elements need no stable order: generally faster, no allocation. `sort` when stability matters or the slice is mostly sorted.
- `#[inline]` only on a very small function or one with a single call site. Split a rarely-run branch into its own `#[cold]` function. Re-benchmark: inlining can slow code down.
- I/O in a loop: wrap a `File` or socket in `BufReader` / `BufWriter` and call `flush()` before it drops; lock stdout once and `writeln!` to the lock instead of `println!` per item.
- Reading lines in a loop: reuse one `String` with `read_line` instead of `lines()`, which allocates a `String` per line. `read_line` differs twice: it appends, so `clear()` the buffer after each line; and it keeps the trailing `\n` (or `\r\n`) that `lines()` strips, so `trim_end()` before parsing or comparing.

```rust
use std::io::{self, BufRead};

fn sum_stdin() -> io::Result<u64> {
    let mut input = io::stdin().lock();
    let mut line = String::new();
    let mut sum = 0u64;
    // wrong: `for line in input.lines()` allocates per line
    while input.read_line(&mut line)? != 0 {
        // wrong: `line.parse::<u64>()` fails on every line, the `\n` is still there
        let n = line.trim_end().parse::<u64>().map_err(io::Error::other)?;
        sum = sum.checked_add(n).ok_or(io::ErrorKind::InvalidData)?;
        line.clear(); // wrong without it: the next pass sees both lines
    }
    Ok(sum)
}
```

## Early-Exit Direction

An early-exit must break on the arm that ends the work. A monotone accumulator (Shannon entropy, any sum of non-negative terms) is non-decreasing, so break once it clears the floor (`>= threshold`). Never `return` on the failing arm (`< threshold`) mid-sum: the value starts below the floor and needs several terms to reach it.

## Benchmarks

Criterion (`cargo bench` via the `criterion` crate) over unstable `#[bench]`: stable Rust, statistical output, HTML reports; `divan` is the other stable option. Benchmarks live in `benches/` as their own crate target, not in `tests/` or an inline `#[cfg(test)]` module. `cargo test`'s default run skips them; a CI job gates on them only by running `cargo bench` or `cargo criterion` explicitly. Feed them real-world inputs and keep microbenchmarks few.

## Debug Builds of Heavy Dependencies

Native/numerical crates (ONNX runtimes, tokenizers, arrow/datafusion engines, tree-sitter) run 10-50× slower unoptimized, crawling `cargo test`. Raise opt-level for just those packages while your own crate keeps fast incremental rebuilds:

```toml
[profile.test]
opt-level = 1                      # every package built for tests

[profile.dev.package.ort]          # compute-bound native dep
opt-level = 3

[profile.dev.package.datafusion]   # query/columnar engine
opt-level = 2
```

The dep rebuilds once at the higher level; your edit-test loop stays fast. A dependency's generic functions are compiled in the crate that uses them, so the override may not speed those up. `[profile.*]` tables count only in the workspace root `Cargo.toml`: cargo ignores them in a dependency.

Release levers, one per benchmark run: `codegen-units = 1`, `lto = "thin"` or `"fat"`, and `panic = "abort"` only when nothing needs to unwind. An alternative allocator does nothing as a bare dependency: wire it in with `#[global_allocator] static GLOBAL: mimalloc::MiMalloc = mimalloc::MiMalloc;`. For the rest of build configuration (release profiles, LTO, workspace-wide levers), load the `cargo-toml-optimization` skill if installed.

## Checklist

- [ ] Every number quoted comes from a `--release` build, and the change targets code a profile showed hot.
- [ ] No `&Vec<T>` parameter, no `format!` without a placeholder, no `collect()` that is only iterated again.
- [ ] Loops reuse buffers and iterate instead of indexing; an elision `assert!` was not weakened to `debug_assert!`.
- [ ] No fast hasher on a map keyed by untrusted input.
- [ ] Each `#[inline]`, hasher swap and profile lever was benchmarked on its own.
