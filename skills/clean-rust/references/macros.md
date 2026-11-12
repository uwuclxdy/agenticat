# Macros

- Load when writing, changing or debugging a `macro_rules!` macro, exporting one, or writing a proc macro.
- Doc comments and doc links for a macro: `docs.md`.

## Before Writing

- Write a function, generic or trait first. Write a macro only when none of them can express the need.
- Define declarative macros with `macro_rules! name { .. }`. Never `macro name(..) { .. }`: it is nightly-only (`decl_macro`).
- Call a macro only where a pattern, statement, expression, item, impl item or type is expected. Never in a struct field list or where a name is expected: expand to the whole item, or write a proc macro.
- The expansion must be the kind its call position expects: `let x = m!();` fails when `m!` expands to an `impl`.
- Items with generics, `where` clauses or `unsafe`/`async` qualifiers: parse them in a proc macro, not in more `macro_rules!` arms.
- Use plain repetition `$( .. )*` whenever it can express the transform. A recursive muncher is the fallback.
- Call in statement position as `m!(..);` or `m![..];`. Wrap the definition body in `{ }`.

## Matchers

```rust
macro_rules! vec_of {
    // WRONG: ([$($e:expr),*]) => ..  the call's own [] never reaches the matcher
    // WRONG: ($($e:expr)*) => ..     `expr` cannot follow `expr`: add a separator
    // WRONG: ($($e:expr),?) => ..    `?` takes no separator
    ($($e:expr),* $(,)?) => {{
        let mut v = Vec::new();
        $( v.push($e); )*
        v
    }};
}
let v = vec_of![1, 2, 3,];
assert_eq!(v, [1, 2, 3]);
```

- The matcher sees only the tokens inside the call's delimiters and must consume all of them.
- A list matcher accepts a trailing comma: `$(,)?` after the repetition, never `,?`.
- After `$x:expr` or `$x:stmt` only `=>` `,` `;` may come.
- After `$x:pat` only `=>` `,` `=` `if` `in`. After `$x:pat_param` also `|`.
- After `$x:ty` or `$x:path` only `=>` `,` `=` `|` `;` `:` `>` `>>` `[` `{` `as` `where`, or a `$b:block` capture.
- After `$v:vis` only `,`, an identifier or keyword other than a non-raw `priv`, a token that can begin a type, or an `ident`/`ty`/`path` capture.
- `ident`, `tt` and `literal` captures may be followed by anything.
- `$t:tt` is one token or one `(..)`/`[..]`/`{..}` group. `m!(1 + 2)` needs `$($t:tt)*`, not `$t:tt`.
- Or-patterns (edition 2021+): `$p:pat` matches `A | B` itself. With `|` as your own separator write `$($p:pat_param)|+`. Edition 2018 and older keep `$($p:pat)|+`.
- Edition 2024: `$e:expr` also matches `const { .. }` and `_`. Put a `(const $e:expr) => { .. }` arm above the `($e:expr)` arm, or capture `$e:expr_2021` for the old matching.

| To capture | Write |
|---|---|
| a name | `$n:ident` (matches keywords too; `_` needs `$n:tt`) |
| a fn parameter | `$a:ident : $t:ty`, never `$a:pat : $t:ty` |
| a literal, `-1` included | `$l:literal` |
| attributes and `///` docs | `$(#[$m:meta])*`, re-emitted as `$(#[$m])*` |
| visibility | `$v:vis` with another token after it, never `$(pub)?` |
| statements | `$($s:stmt)*` (a capture holds no trailing `;`, except an item statement such as `struct Foo;`) |
| input to inspect or forward later | `$($t:tt)*` |

- A fn matcher keeps every optional piece: `$(#[$m:meta])* $v:vis fn $name:ident ( $($a:ident : $t:ty),* $(,)? ) $(-> $ret:ty)? $body:block`.

## Arm Order and Ambiguity

- Arms are tried top to bottom and the first match wins. Specific arms first, the catch-all `($($t:tt)*)` last.
- No backtracking: once a fragment such as `$e:expr` starts consuming tokens, a parse failure is a hard error, not a fall-through. Put arms that start with literal tokens above arms that start with a fragment.
- Inside one arm every token needs exactly one parse: `($($i:ident)* $last:ident)` is an ambiguity error, and reordering arms does not fix it.
- Never reuse a repetition's separator as the token after it: `$($x:expr),+ , $y:expr` is ambiguous; write `$($x:expr),+ ; $y:expr`.
- A capture other than `ident`, `lifetime` or `tt` is opaque once forwarded: the next macro cannot match it against literal tokens. Forward `$($t:tt)*` when the next macro must look inside.

## Transcribers

- Use a repeated capture only inside `$( .. )*`, at the same depth as in the matcher.
- Captures under one `$( .. )*` must repeat the same number of times.
- Nested input needs nested repetition: match `$( $( $x:ident ),* );*`, expand `$( $( .. $x .. )* )*`.
- Never expand to half a construct (`$e, next!(..)`). Carry partial output as `[$($acc:tt)*]` through the recursive arms and emit it in the last arm.
- No defensive parentheses: an `$e:expr` capture and a whole expansion are each one AST node.
- When only the length of a repetition matters, swap each capture for one fixed expression, never one macro per arity: `$( replace_expr!(($t) Default::default()), )*` with `macro_rules! replace_expr { ($_t:tt $sub:expr) => { $sub }; }`.

## Recursion

- Internal helper arms start with `@name` and sit above the public arms: `(@step $($t:tt)*) => { .. };`. Never export a second helper macro.
- A muncher carries its unprocessed input as `$($tail:tt)*`, never as `expr` or `stmt`.
- An enum muncher takes one variant per step through `@variant` arms: one each for tuple, named-field and unit variants, plus the base cases `(@variant ,)` and `(@variant)`.
- A macro never sees another macro's expansion in its input: `outer!(inner!())` receives the tokens `inner ! ()`. Pass a callback instead: `($cb:ident ( $($args:tt)* )) => { $cb!($($args)*) };`.
- Expansion depth limit is 128. A correct deep recursion gets `#![recursion_limit = "256"]` at the crate root: do not rewrite the macro.
- Debug by reading the expansion (`cargo expand`), not the definition.

## Hygiene and Export

```rust
#[macro_export]
macro_rules! clamp_min {
    // WRONG: audit(max($v, $min))            bare names resolve at the call site
    // WRONG: $crate::audit(std::cmp::max(..)) the caller can shadow `std`
    ($v:expr, $min:expr) => {
        $crate::audit(::std::cmp::max($v, $min))
    };
}

pub fn audit(v: i32) -> i32 {
    v
}

fn main() {
    assert_eq!(clamp_min!(1, 5), 5);
}
```

- In a `#[macro_export]` macro reach your crate's items as `$crate::module::item` (full module path, never `crate::`) and std as `::std::..`. `clippy::crate_in_macro_def`
- A macro that must work in a `no_std` crate writes `::core::..` or a `$crate` re-export, never `::std::..`.
- Only local variables, labels and `$crate` are hygienic. Every other name resolves where the macro is called.
- A local that the caller's expression must see is named by the caller: capture `$name:ident`, then `let $name = ..;`. A `let total` written in the macro body is invisible to `$e`.
- Same for `self` in a generated method: capture `$self_:ident` and pass `self` at the call.
- A `macro_rules!` macro exists only below its definition. Put `#[macro_use] mod macros;` above the modules that call it. Defining the same name again shadows the earlier rules, never merges them.
- Or give it a path: `pub(crate) use name;` below its definition, then `use crate::macros::name;` anywhere.
- Use another crate's macro by path: `use other_crate::the_macro;`. Never `#[macro_use] extern crate`.
- Do not `#[macro_export]` an internal macro. One that must be exported gets `#[doc(hidden)]`.

## Proc Macros

```rust
// fragment
#[proc_macro_derive(Describe, attributes(describe))]
pub fn derive_describe(item: TokenStream) -> TokenStream {
    // WRONG: returning `item` or tokens that contain it: the type is defined twice
    let ast = parse_macro_input!(item as DeriveInput);
    let name = &ast.ident;
    // WRONG: impl Describe for #name {} breaks on `struct S<T>`
    let (impl_generics, ty_generics, where_clause) = ast.generics.split_for_impl();
    quote! { impl #impl_generics Describe for #name #ty_generics #where_clause {} }.into()
}
```

- A derive returns only the new items. Its output is appended next to the input, which stays in place.
- An attribute macro takes two streams, `(args: TokenStream, item: TokenStream)`, and returns the whole replacement item.
- A function-like macro is `#[proc_macro] pub fn name(input: TokenStream) -> TokenStream`.
- Never return `Result` from any of the three: fail by expanding to `compile_error!("..")` or by panicking.
- Field attributes a derive reads are declared: `#[proc_macro_derive(Name, attributes(helper))]`. An undeclared one is a compile error.
- Proc macros sit at the root of their own crate, which sets `proc-macro = true` under `[lib]` in `Cargo.toml`. They cannot be used inside that crate, only from one that imports them.
- Parse with `syn` (`parse_macro_input!(input as DeriveInput)`) and generate with `quote!` (`#name`, `#( #items )*`). Never walk or push raw tokens by hand.
- Helper functions take and return `proc_macro2::TokenStream`, so they can be unit tested. Convert with `.into()` at the `#[proc_macro..]` boundary.
- Spans: `Span::call_site()` for a name the caller must be able to use, `Span::mixed_site()` for `macro_rules!`-like hygiene.

## Checklist

- [ ] Every `expr`, `stmt`, `pat`, `pat_param`, `ty`, `path` and `vis` capture is followed by a token from its follow set.
- [ ] Every list matcher ends with `$(,)?`.
- [ ] Specific arms and `@internal` arms sit above the catch-all arm.
- [ ] No macro call in a field list or name position; no `macro` keyword.
- [ ] Exported macro: every path is `$crate::..`, `::std::..` or `::core::..`; names the caller must see are captured as `ident`.
- [ ] No expansion is half a construct; no extra parentheses.
- [ ] A derive returns only new items; no proc macro returns `Result`.
