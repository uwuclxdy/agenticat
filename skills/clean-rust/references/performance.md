# Performance

Apply these as you write hot-path code — tight loops, per-request handlers, per-frame renders, per-chunk parsers. Cold paths (startup, error branches) can ignore all of it. For anything beyond these defaults: profile first; a switch that doesn't show up in profiler output isn't worth its churn.

## Hasher Choice Is a Security Decision

The default `HashMap` hasher (SipHash-1-3) is DoS-resistant and slower; swapping it for speed on the wrong map is a vulnerability, not a style choice.

| Hasher | Crate | DoS-resistant | Use when |
|---|---|---|---|
| SipHash-1-3 | std default | yes | keys come from untrusted input |
| aHash | `ahash` | yes (random per-process seed) | general-purpose faster default |
| FxHash | `rustc-hash` | **no** | trusted integer/pointer keys only (internal IDs, caches) |

Never expose a predictable hasher (`FxHashMap`) to user-supplied strings, network data, or untrusted paths — hash flooding turns your map into an O(n²) DoS target.

## Allocation Discipline

- `with_capacity(n)` on `Vec`/`String`/`HashMap` whenever the bound is cheap to know.
- `map.entry(key).or_insert_with(...)` over a `contains_key` + `insert` double lookup.
- `mem::take(&mut field)` / `mem::replace` to move out of `&mut` without cloning.
- Don't `.to_string()`/`.clone()` a `&str` heading into an `Into<Cow<'_, str>>` API — the borrow is zero-alloc.
- Don't `.to_vec()` what already derefs to `[T]` (`Arc<[T]>`, slices) when you only read.

## String Building

- `format!` only for real formatting (width, padding, precision). Plain concat: `let mut s = n.to_string(); s.push_str(" items");` — measurably faster.
- Append in place with `push_str`; `s = format!("{s}{suffix}")` reallocates the whole string every pass.
- Compile-time constants concat with `concat!(...)` into a `&'static str` — zero runtime cost.
- `eq_ignore_ascii_case` for known-ASCII comparisons; never `.to_lowercase()` per call. `.len()` for ASCII; `.chars().count()` is O(n) and only for possibly-non-ASCII input.
- `LazyLock` for anything computed once per process: compiled regexes, lookup tables, formatted process metadata.
- Bounded discrete inputs (a `u8` percentage, a status enum) map through a `static TABLE: [&str; N]` returning `&'static str` — no allocation at all.

## Iterator Laziness

Chains do nothing until consumed — build the full pipeline and consume once. `collect()` into an intermediate `Vec` mid-chain defeats the point (see `SKILL.md` on premature collection); `.collect::<Result<Vec<_>, _>>()` at the end short-circuits on the first error without allocating for the failures.

## Debug Builds of Heavy Dependencies

Native/numerical crates (ONNX runtimes, tokenizers, arrow/datafusion engines, tree-sitter) run 10–50× slower unoptimized, crawling `cargo test`. Raise opt-level for just those packages while your own crate keeps fast incremental rebuilds:

```toml
[profile.test]
opt-level = 1                      # the crate under test

[profile.dev.package.ort]          # compute-bound native dep
opt-level = 3

[profile.dev.package.datafusion]   # query/columnar engine
opt-level = 2
```

The dep rebuilds once at the higher level; your edit-test loop stays fast. For the rest of build configuration (release profiles, LTO, workspace-wide levers), load the `cargo-toml-optimization` skill if installed.
