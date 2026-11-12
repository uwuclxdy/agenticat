# Std Toolbox

Load when code touches `Option`, `Result`, an iterator chain, a `String` or `&str`, a slice, a `Vec`, a map or set, or integer arithmetic and casts.
Each rule names the std method that replaces a hand-written `match`, loop or index. A version in parentheses is that form's minimum Rust: below the crate's `rust-version`, keep the older form.

## Option and Result

- Absence is `Option<T>`, never `-1`, `""` or another sentinel. Get the `T` out before using it.
- Propagate with `?`, never `match` plus `return Err(e)`. In a function returning `Result`, turn an `Option` into a `Result` first: `opt.ok_or(err)?`.
- Never drop a `Result`: `?`, a `match`, or `.expect(..)`. `unused_must_use`
- No `.unwrap()` to quiet the compiler: `unwrap_or(v)`, `unwrap_or_else(f)`, `unwrap_or_default()`, `?`, or `let Some(x) = opt else { return .. };` (1.65). `clippy::unwrap_used`
- Where a panic is intended, `.expect("slice should not be empty")`: the message says why the value should be there.
- `map_err` changes the error; `map` changes the `Ok` value.
- Fallible items: `.collect::<Result<Vec<_>, _>>()` stops at the first `Err`, `.collect::<Option<Vec<_>>>()` at the first `None`.

```rust
use std::num::ParseIntError;
// WRONG: match s.parse::<u16>() { Ok(n) => n, Err(e) => return Err(e.to_string()) }
fn port(s: Option<&str>) -> Result<u16, String> {
    let s = s.ok_or("no port given")?; // Option -> Result, then `?`
    s.trim().parse::<u16>().map_err(|e| e.to_string()) // `map_err`, not `map`
}
fn all(items: &[&str]) -> Result<Vec<u16>, ParseIntError> {
    items.iter().map(|s| s.parse::<u16>()).collect() // stops at the first Err
}
```

| Instead of | Write |
|---|---|
| `unwrap_or(build())`, `ok_or(build())`, `or_insert(build())` | `unwrap_or_else(f)`, `ok_or_else(f)`, `or_insert_with(f)`: lazy. `clippy::or_fun_call` |
| `opt.map_or(false, pred)` | `opt.is_some_and(pred)` (1.70), `res.is_ok_and(pred)`. For `map_or(true, pred)`: `opt.is_none_or(pred)` (1.82), `None` passes. `clippy::unnecessary_map_or` |
| a nested `match` per fallible step | `a.and_then(step)`; fallback with `.or_else(f)` |
| a `match` over `Some(Ok(v))`, `Some(Err(e))`, `None` | `opt.transpose()?` (1.33) |
| `opt.clone().map(f)` on a borrowed option | `opt.as_ref().map(f)` |
| `match opt { Some(v) if ok(&v) => Some(v), _ => None }` | `opt.filter(ok)` |
| `if let Some(x) = opt { v.push(x) }` | `v.extend(opt)`; `.chain(opt)` inside a chain |
| `for x in opt { .. }` | `if let Some(x) = opt { .. }` |

## Iterators

- Adapters are lazy: a statement ending in `.map(..)` runs nothing. End the chain with `collect`, `sum`, `count`, `for_each` or a `for` loop. `unused_must_use`
- `for x in v` consumes `v`. Loop over `&v` to read, `&mut v` to change in place (`*x += 1`), `v` only when it is not used again. Write `&v`, not `v.iter()`, in a `for` head. `clippy::explicit_iter_loop`
- `.iter()` yields `&T`, and the closure of `filter`, `take_while` and `skip_while` gets a reference to that: `.filter(|&x| *x > 1)`. Turn `&T` items into values with `.copied()` for `Copy` types. `clippy::cloned_instead_of_copied`
- Give `collect` and `parse` a target type: `let v: Vec<_> = ..`, `.collect::<Vec<_>>()`, `"42".parse::<i32>()`.
- `boxed_slice.into_iter()` yields references before edition 2024 and values from it; `array.into_iter()` changed the same way in edition 2021. On either, `.iter()` gives references on every edition.
- `10..1` is empty: count down with `(1..=n).rev()` (1.26).
- `it.by_ref().take(2)` leaves `it` usable afterwards; `it.take(2)` consumes it.

```rust
let v = vec![3, 1, 2];
// WRONG: v.iter().map(|x| println!("{x}")); (lazy: prints nothing)
v.iter().for_each(|x| println!("{x}"));
// WRONG: `for x in v { .. }` and then another use of `v` (moved)
for x in &v {
    println!("{x}");
}
let big: Vec<i32> = v.iter().filter(|&x| *x > 1).copied().collect();
assert_eq!(big, [3, 2]);
```

| Instead of | Write |
|---|---|
| `.map(f).filter(Result::is_ok).map(Result::unwrap)` | `.filter_map(..)` with `.ok()`, or `.flatten()`. `clippy::manual_filter_map` |
| an accumulator loop, or `fold`, for a total or a test | `.sum::<i32>()`, `.any(p)`, `.all(p)`, `.count()` |
| `.collect::<Vec<_>>().len()` | `.count()`: never collect to call one method. `clippy::needless_collect` |
| `.find(p).is_some()` | `.any(p)`; `.contains(&x)` on a slice. `clippy::search_is_some` |
| `for i in 0..a.len()` indexing `a[i]` and `b[i]` | `a.iter().zip(&b)`: ends at the shorter side |
| a `push` loop; `v.extend(it.collect::<Vec<_>>())` | `v.extend(it)`, `v.extend_from_slice(&other)` |
| a loop with a flag and `break` | `try_fold`, `try_for_each`: the closure returns `Option`, `Result`, `ControlFlow` |
| `.max()` on floats (does not compile) | `v.iter().copied().reduce(f64::max)` |

- `.rev()` needs a double-ended iterator: `map` and `filter` keep one, `take_while`, `skip_while` and `scan` do not.
- `take_while` stops at the first `false` and `skip_while` stops skipping there; neither re-tests later items like `filter`.
- Bound an infinite iterator (`0..`, `repeat(x)`) with `.take(n)` before `collect`, `min` or `max`.
- `.sum()` panics on integer overflow where overflow checks are on (dev by default): `v.iter().try_fold(0i32, |acc, &x| acc.checked_add(x))` returns `None` instead.
- A parameter that is only iterated takes `T: IntoIterator`, not `&Vec<T>`.

## Strings

- `s[0]` does not compile, and `s.len()` counts bytes. Characters: `s.chars().count()`, `s.chars().nth(i)`. Bytes: `s.as_bytes()[i]`.
- A string literal is a `&str`: `let s: String = "hi";` does not compile. Build a `String` (`String::from("hi")`) only for text made or changed at run time.
- A `char` is a Unicode scalar value, not a visible character: `"y\u{306}".chars().count()` is 2. Truncate or measure display text per grapheme cluster, with a crate.
- `&s[a..b]`, `split_at` and `insert_str` panic when an offset falls inside a multi-byte character. Use offsets that `find` or `char_indices` returned, or the checked forms: `s.get(a..b)`, `s.split_at_checked(i)` (1.80), `s.floor_char_boundary(i)` (1.91). `clippy::string_slice`
- `chars().enumerate()` numbers characters; `char_indices()` gives byte offsets. Only the second may index the string. `clippy::char_indices_as_byte_indices`
- Bytes to text: `str::from_utf8(bytes)?`, `String::from_utf8(vec)?`. Never `from_utf8_unchecked` on unvalidated input; non-UTF-8 data stays `Vec<u8>` or `OsString`.
- Integer to `char`: `char::from_u32(n)` returns an `Option`; `n as char` compiles only for `u8`.

```rust
let s = "héllo";
assert_eq!(s.len(), 6); // bytes
assert_eq!(s.chars().count(), 5); // characters
// WRONG: &s[..2] (panics: byte 2 is inside 'é')
assert_eq!(s.get(..2), None);
// WRONG: for (i, c) in s.chars().enumerate() { &s[i..] }
for (i, c) in s.char_indices() {
    println!("{c} starts {}", &s[i..]);
}
assert_eq!(char::from_u32(0x41), Some('A'));
```

| Instead of | Write |
|---|---|
| `s.split(' ')` plus dropping empties | `s.split_whitespace()` |
| `s.split('=').nth(1)` | `s.split_once('=')` (1.52): `Some((key, rest))`, `rest` keeps later `=` |
| `s.split('\n')` | `s.lines()` |
| `"a,b,".split(',')` (a trailing `""`) | `s.split_terminator(',')` |
| `split('\n')`, then re-adding the `\n` | `s.split_inclusive('\n')` (1.51): each piece keeps its terminator |
| `s.split("x")`, `s.replace("x", ..)` for one character | `s.split('x')`: a `char` pattern. `clippy::single_char_pattern` |
| `trim_left`, `trim_right` (deprecated) | `trim_start`, `trim_end` |
| `trim_start_matches(p)` to drop one prefix | `s.strip_prefix(p)`, `strip_suffix` (1.45): once, `None` on a miss |
| `impl ToString for T` | `impl fmt::Display for T`. `clippy::to_string_trait_impl` |
| `s = s + a + b` in a loop | `s.push_str(a)`; `format!("{a}{b}")` to mix literals and values |
| `match owned { "GET" => .. }` | `match owned.as_str()` |

- `s.replace(a, b)` returns a new `String`; `s` itself is unchanged.
- Change case on the whole `str` (`s.to_uppercase()`), never per `char`: `'ß'` becomes `"SS"`.

## Slices and Vec

- `v[i]` and `map[&k]` panic on a miss. When the index or key may be absent: `v.get(i)`, `v.first()`, `v.last()`, `map.get(&k)`. When a bad index is a bug keep `v[i]`, never `v.get(i).unwrap()`. `clippy::get_unwrap` (`clippy::indexing_slicing` flags every `v[i]`, the kept ones too: only on a panic-free module)
- `Vec::with_capacity(n)` has length 0, so `reader.read(&mut buf)` reads nothing into it: `buf.resize(n, 0)` first. `clippy::read_zero_byte_vec`
- `[String::new(); 3]` does not compile: a repeat with length > 1 needs a `Copy` type or a `const`. Use `std::array::from_fn` (1.63).

```rust
let v = vec![10, 20, 30];
// WRONG: let last = v[v.len() - 1]; (panics on an empty Vec)
let last = v.last().copied();
let second = v.get(1).copied().unwrap_or(0);
// WRONG: let names = [String::new(); 3];
let names: [String; 3] = std::array::from_fn(|i| format!("n{i}"));
println!("{last:?} {second} {names:?}");
```

| Instead of | Write |
|---|---|
| an index loop calling `v.remove(i)` | `v.retain(keep)`, `retain_mut` (1.61); maps and sets too |
| a remove loop that keeps what it removed | `v.extract_if(.., pred).collect()` (`Vec` 1.87); `map.extract_if(pred).collect()` (`HashMap`, `HashSet` 1.88) |
| `v.remove(i)` when order does not matter | `v.swap_remove(i)` |
| `v.insert(0, x)`, `v.remove(0)` | `VecDeque`: `push_back`, `pop_front` |
| a three-line swap through a temporary | `v.swap(i, j)`. `clippy::manual_swap` |
| `let old = v.clone(); v = Vec::new();` | `let old = std::mem::take(&mut v);` |
| `v.sort()` when equal items need no stable order | `v.sort_unstable()`, `sort_unstable_by_key(key)`. `clippy::stable_sort_primitive` |
| `a.partial_cmp(b).unwrap()` in a float sort | `v.sort_unstable_by(f64::total_cmp)` (1.62) |
| hand-written window or block index loops | `v.windows(n)`, `v.chunks(n)`, `v.chunks_exact(n)` |
| `Vec::new()` before a known number of pushes | `Vec::with_capacity(n)` |

- `v.dedup()` removes only adjacent repeats: sort first when every duplicate must go.
- `dst.copy_from_slice(src)` panics unless the lengths match; inside one slice go through `split_at_mut`.
- Never `unsafe { v.set_len(0) }`: `v.clear()`.
- Dropping a `drain(..)` iterator early drops every item it has not yielded: they leave the collection. Take only what you need (`pop`, `pop_front`), or keep the rest with `retain` or `extract_if`.
- A `VecDeque` is a ring: sort or slice it through `buf.make_contiguous()` (1.48), as in `buf.make_contiguous().sort()`.

## Maps and Sets

- Insert-or-update goes through `entry`, one lookup: `.or_insert(v)`, `.or_default()`, `.or_insert_with(f)`, `.and_modify(f)`. Never `contains_key` then `insert`. `clippy::map_entry`
- `HashMap` and `HashSet` iterate in arbitrary order: sort before printing, comparing or asserting. `BTreeMap` when the result must be key-sorted. `clippy::iter_over_hash_type`
- A key's `Eq` and `Hash` must agree: derive `PartialEq, Eq, Hash` together and never mutate a stored key.
- Default to `Vec` and `HashMap`. `BinaryHeap` for repeated take-the-largest (`Reverse` for smallest), `VecDeque` for a queue.
- Look up by the borrowed form: `map.get("name")` on a `HashMap<String, V>`, never `&name.to_string()`.
- `set.insert(v)` returns `false` when present: no `contains` guard. `clippy::set_contains_or_insert`
- `map.insert(k, v)` on a present key replaces the value and returns the old one; the stored key stays the old one.
- Set logic: `a.is_disjoint(&b)`, `is_subset`, `intersection`, `union`, `symmetric_difference`, never `contains` loops. `a.difference(&b)` is only what `a` has and `b` lacks.
- A `static` map: `static M: LazyLock<HashMap<K, V>> = LazyLock::new(..);` (1.80). `HashMap::new()` is not `const`.
- `BTreeMap` ends: `first_key_value()`, `last_key_value()`, `pop_first()`, `pop_last()`, `first_entry()` (1.66), never `keys().max()` or pop and re-insert.

```rust
use std::collections::HashMap;
let mut count: HashMap<&str, u32> = HashMap::new();
for w in ["a", "b", "a"] {
    // WRONG: if count.contains_key(w) { .. } else { count.insert(w, 1); }
    *count.entry(w).or_default() += 1;
}
let mut keys: Vec<&str> = count.keys().copied().collect();
keys.sort_unstable(); // WRONG: asserting on the unsorted order
assert_eq!(keys, ["a", "b"]);
```

## Numbers

- Comparisons do not chain: `a < b && b < c`.
- No `;` after a function's tail expression: `fn f() -> i32 { compute(); }` does not compile.
- `+`, `-`, `*` overflow panics where overflow checks are on (dev by default) and wraps where they are off (release by default). State the intent: `checked_add`, `wrapping_add`, `saturating_add`. `clippy::arithmetic_side_effects`
- `x / 0`, `x % 0` and `i32::MIN / -1` panic in every build: test the divisor or use `checked_div`.
- Narrow with `u8::try_from(n)?`, never `n as u8` (truncates silently). A float-to-integer `as` saturates and maps NaN to 0. `clippy::cast_possible_truncation`
- Lengths and indices are `usize`. `%` keeps the dividend's sign: `i.rem_euclid(n)` for an index. Test NaN with `x.is_nan()`, never `==`.

```rust
fn mean(sum: u64, count: u64) -> Option<u8> {
    // WRONG: (sum / count) as u8 (panics on 0, truncates above 255)
    u8::try_from(sum.checked_div(count)?).ok()
}
assert_eq!(250u8.checked_add(10), None);
assert_eq!((-5i32).rem_euclid(3), 1);
```

## Checklist

- No `.unwrap()` outside tests: `?`, a fallback, or `.expect("why it cannot fail")` where failure is a bug; no dropped `Result`.
- Every chain ends in a consumer; no collection used after `for x in v`.
- No `s[i]`, no `str` slice at an unchecked offset, no `len()` used as a character count.
- No `v[i]` or `map[&k]` with an index or key that input controls.
- No `contains_key` then `insert`; nothing depends on `HashMap` order.
- No narrowing `as`; no bare `+ - * /` on input-controlled integers.
- Each hand-written loop checked against the tables above.
