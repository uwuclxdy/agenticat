# Docs

- Load when writing or changing doc comments, doctests, doc links or ordinary comments, or when laying out code or `Cargo.toml` by hand.
- Help text of command-line arguments: `cli.md`.

## Doc Comments

```rust
/// Parses a TCP port.
///
/// Detail paragraphs go below the blank line. The first line alone is the summary.
///
/// # Errors
///
/// Fails when `s` is not a whole number from 0 to 65535.
///
/// # Examples
///
/// ```
/// # use std::num::ParseIntError;
/// let port = my_crate::parse_port("8080")?;
/// assert_eq!(port, 8080);
/// # Ok::<(), ParseIntError>(())
/// ```
pub fn parse_port(s: &str) -> Result<u16, std::num::ParseIntError> {
    s.parse()
}
```

- Order: one summary line, a blank `///`, detail, the `# Errors`, `# Panics` or `# Safety` sections that apply, then `# Examples` with code the user can copy and run.
- An example shows why to use the item, not only how to call it.
- `///` documents the next item. `//!` at the top of a file documents the crate or module.
- Document every `pub` item. `missing_docs`
- `missing_docs` is off by default: turn it on per library crate with `missing_docs = "warn"` under `[lints.rust]` (`lints.md`). It also asks for a `//!` doc on the crate root, a binary's included.
- A function that returns `Result` gets a `# Errors` section saying when it fails. `clippy::missing_errors_doc`
- A function that can panic gets a `# Panics` section saying when. `clippy::missing_panics_doc`
- An `unsafe fn` gets a `# Safety` section listing every invariant the caller must uphold. `clippy::missing_safety_doc`
- Identifiers and paths in doc prose go in backticks. `clippy::doc_markdown`
- Write `///`, never `#[doc = ".."]` by hand. The attribute form is for macro output and `include_str!`.
- The doc comment goes above the attributes: `///` first, then `#[derive(..)]`.
- A public item that exists on one platform only: `#[cfg(any(windows, doc))]`, so the docs show it on every host. A bare `#[cfg(windows)]` hides it.
- A name users search for but the item does not carry: `#[doc(alias = "name")]`, several as `#[doc(alias("x", "big"))]`.

## Doctests

- `?` in a doctest needs a typed last line, `# Ok::<(), ErrorType>(())` (1.34+). A bare `?` does not compile: the error type cannot be inferred. On an older `rust-version` wrap the example in hidden `# fn main() -> Result<(), ErrorType> {` and `# Ok(()) }` lines.
- No `.unwrap()` or `.expect(..)` in an example: use `?` and hide the plumbing.
- A line starting with `# ` is compiled but not shown. Put setup there.
- End with `assert!` or `assert_eq!` on the result. A doctest with no assertion only proves that it compiles.
- Doctests reach only the public API. Private items get unit tests.
- `cargo test` runs a library's doctests. `doctest = false` under `[lib]` in `Cargo.toml` turns them off.
- Nextest runs no doctests: run them with `cargo test --doc`. Their coverage is merged separately (`test-tooling.md`).
- Fenced blocks only, never 4-space indented code.

| Tag after the opening fence | Use for |
|---|---|
| none | the default: compiled and run |
| `no_run` | side effects, network, endless loops: compiled, not run |
| `should_panic` | code that must panic. Underscore, never `should-panic`. `rustdoc::invalid_codeblock_attributes` |
| `compile_fail` | code that must not compile, in place of prose saying so |
| `ignore` | only code that needs a crate the doctest cannot link |
| `text` | output, pseudocode, anything that is not Rust. `rustdoc::invalid_rust_codeblocks` |

- An item that exists only to carry doctests gets `#[cfg(doctest)]`.
- Test the README's examples: `#[doc = include_str!("../README.md")]` on a `#[cfg(doctest)] pub struct ReadmeDoctests;`.

## Links

```rust
/// Builds a [`Config`]. See [`Config::load`], [`parse_port()`] and [`my_macro!`].
///
/// Same name, two kinds: [`enum@Mode`]. Spec: <https://example.com/spec>.
pub struct Linked;
```

- Link an item by its path in brackets. Never paste a docs URL for a Rust item. `rustdoc::broken_intra_doc_links`
- A name shared by two kinds gets a marker: `()` for a function, `!` for a macro, a prefix such as `enum@` otherwise.
- A URL goes in angle brackets, never bare. `rustdoc::bare_urls`
- Close every backtick you open. `rustdoc::unescaped_backticks`
- In the docs of a `macro_rules!` macro, link paths resolve from the crate root, not from the defining module.

## Re-Exports

- Keep implementation modules private and re-export their public items: `mod parser;` then `pub use crate::parser::Parser;`.
- A `pub use` of a dependency or of an item in a public module is shown as a link. Add `#[doc(inline)]` to show the docs in place, `#[doc(no_inline)]` to force the link.

## Comments

- `//` then one space, usually a full sentence. No `/* */` for ordinary notes.
- Non-obvious string input formats get documented above the signature (`// accepts "name", "name:tag", or "ns/name:tag"`).

## Formatting

Layout belongs to the formatter (`cargo fmt`): never align by hand. Type code in these shapes and it leaves the diff alone.

- 4 spaces, no tabs, at most 100 columns.
- A multi-line list (arguments, fields, array items): one item per line, block-indented, trailing comma after the last. Never aligned under the first item.
- A long chain breaks before each `.`. A long binary expression breaks before the operator, an assignment after `=`.
- `match` is always multi-line. An arm ends with `,` unless its body is a block. No leading `|` before an arm's first pattern; the continuation lines of a multi-line pattern start with `|`.
- `where` goes on its own line, one bound per line, trailing comma unless the clause ends with `;`. When the line above is only a closing bracket (a broken parameter list with no return type), it joins that line: `) where`. One short bound stays inline: `fn f<T: Clone>(x: T)`.
- A small struct literal stays on one line with no trailing comma: `Point { x: 1 }`.
- Ranges have no spaces: `0..10`, `a..=b`.
- One attribute per line. A single-expression closure has no braces: `|a, b| a + b`.
- A `println!` or `format!` call too long for one line: the format string on its own line, its arguments together on the next; arguments that do not fit one line go one per line.
- Prefer several one-line `use` lines to one wrapped `use` list.
- A direct `rustfmt` call defaults `edition` and `style_edition` to 2015, while `cargo fmt` takes the edition from `Cargo.toml`. A project or CI step that calls `rustfmt` sets both in `rustfmt.toml`.
- Deprecated `rustfmt.toml` keys and their replacements: `fn_args_layout` -> `fn_params_layout` (same values); `merge_imports = true` -> `imports_granularity = "Crate"`; `hide_parse_errors = true` -> `show_parse_errors = false` (the value flips); `version = "Two"` -> `style_edition = "2024"` (`"One"` equals `"2015"`, `"2018"` or `"2021"`). `imports_granularity` and `show_parse_errors` are unstable: they need a nightly toolchain and `unstable_features = true`.

The formatter does not fix these:

```rust
fn total(xs: &[i32]) -> i32 {
    let sum: i32 = xs.iter().sum();
    report(sum); // a statement ends with `;`
    sum // the tail value has none. WRONG: `sum;` returns `()`: mismatched types
}

fn report(_sum: i32) {}
```

- No parentheses around an `if` or `while` condition. `unused_parens`
- Bind with the expression: `let x = if c { 1 } else { 0 };`. Never `let x;` followed by an assignment per branch. `clippy::needless_late_init`
- `Point { x, y }`, never `Point { x: x, y: y }`. `clippy::redundant_field_names`
- Compare by dereferencing: `*t == u`, never `t == &u`. `clippy::op_ref`
- A one-element tuple type is `(T,)`. `(T)` is just `T`.

## Cargo.toml

- `[package]` comes first. Inside it: `name`, then `version`, the other keys, `description` last. In every other section the keys are version-sorted (`x8` before `x16`).
- `license` is an SPDX expression: `license = "MIT OR Apache-2.0"`.
- A feature list too long for one line: one entry per line, trailing comma, `]` on its own line.

## Checklist

- [ ] Every `pub` item has a one-line summary, plus `# Errors`, `# Panics` or `# Safety` where it returns `Result`, can panic or is `unsafe`.
- [ ] Every example is a fenced doctest ending in an assertion; one that uses `?` ends with `# Ok::<(), E>(())`.
- [ ] No `.unwrap()` or `.expect(..)` in examples; `no_run` on anything with side effects.
- [ ] Items are linked by path, URLs sit in `<..>`, backticks are balanced.
- [ ] The formatter leaves the diff unchanged.
- [ ] No `;` after a tail expression, no parenthesized condition, no `let x;` assigned in branches.
