---
name: maud
description: "Maud Rust `html!` macro reference (0.27)."
metadata:
  author: uwuclxdy
  version: "1.6"
---

# Maud (Rust HTML Macro)

Load before writing or reviewing an `html!` template, a `Render` impl, or a web handler that returns `Markup`.
Rules target maud 0.27.0 (released 2025-02-02); a rule marked `(since x.y)` does not apply on a `maud` pin older than x.y: write the form that version documents.

Maud is a compile-time HTML macro (`html!`); markup lives inline in Rust, type-checked at compile time. There are no template files.

In the code blocks a `// WRONG:` comment shows a stale form; the live code next to it is the form to write.

## Setup

```toml
[dependencies]
maud = "0.27"
```

- Runs on stable Rust (since 0.22.1) and on nightly, where error messages are better. Never add `#![feature(proc_macro_hygiene)]`. MSRV is not documented.
- Default features: none. `json` and `salvo` are not features of 0.27.0 (unreleased upstream): never enable them.

## Rendering API

`html! { ... }` returns a `Markup` value. `Markup` is a type alias for `PreEscaped<String>`, a wrapper around an already-escaped HTML string.

| Operation | Result | Notes |
|---|---|---|
| `html! { ... }` | `Markup` | The macro takes one argument, the template. |
| `markup.into_string()` | `String` | Consumes the `Markup`, hands back the built string. |
| `(DOCTYPE)` inside `html!` | emits `<!DOCTYPE html>` | `maud::DOCTYPE` is a constant holding that string. |

```rust
use maud::{html, DOCTYPE}; // WRONG: use maud::html!;
let name = "Lyra";
// WRONG: html!(out, { p { "hi" } })   no buffer argument (removed in 0.11)
let page = html! {
    (DOCTYPE) // WRONG: <!DOCTYPE html>
    html {
        head { meta charset="utf-8"; title { "My site" } }
        body { p { "Hi, " (name) "!" } }
    }
};
let text: String = page.into_string(); // WRONG: page.to_html(), format!("{page}")
```

- `Markup` has no `Display` impl: get the `String` with `.into_string()`.
- There is no `html_to!` or write-into-buffer macro, and `html_debug!` was removed in 0.25. To append to an existing `String`, call `Render::render_to` (see Custom Rendering and Composition).

## Elements and Text

- Element with content: `name { ... }`; text and nested elements go inside. Angle-bracket HTML does not parse.
- Void element: end with `;`, no body (`br;`). Maud emits HTML5 `<br>`, not `<br />`. `br {}` renders `<br></br>`; `br /;` is a compile error (since 0.23).
- Text is a double-quoted Rust string literal with backslash escapes. Bare words, numbers (`42`) and chars (`'a'`) are compile errors: quote them or splice them. Raw strings (`r#"..."#`) suit long or quote-heavy text.
- Names take hyphens and colons: custom elements, `data-*`, ARIA, `xml:lang`, `on:click`.
- Comment with `//`. `<!-- -->` does not parse; to emit one, splice `(PreEscaped("<!-- note -->"))`.
- "Type-checked" covers Rust splice types only. Maud validates no element or attribute name and no content-model nesting (a `div` inside a `p` compiles): any Rust ident compiles as a tag, typos included.

```rust
use maud::html;
let poem = html! {
    // WRONG: <h1>Poem</h1>               angle brackets
    h1 { "Poem" }
    // WRONG: p { Rock, you are a rock. }  unquoted text
    p {
        strong { "Rock," } " you are a rock."
        br; // WRONG: br {}   br /;
        "Gray, you are gray,"
    }
    link rel="stylesheet" href="poetry.css";
    pre { r#"Raw "string": no escapes needed."# }
};
```

## Attributes

- Value: `name="value"`, always quoted. `href=about.html` does not parse. `class: "x"` compiles and renders a broken attribute named `class:x`.
- Boolean or empty attribute: bare name (`checked`), no `=`. `disabled=true` is a compile error. The `checked?` suffix (required before 0.22.2) still parses: never write it.
- Toggle a boolean attribute or a class with a bool in brackets: `disabled[locked]`, `p.cute[n > 50]`. Never duplicate the element under `@if` to add or drop one.
- Optional value (since 0.23): `title=[opt]` takes an `Option`. `Some(v)` renders `title="v"`, `None` omits the attribute. `title=(opt)` does not compile. Bare `[cond]` toggles presence; `=[opt]` sets a value.
- Class and id shorthand: `.class`, `#id`, chained (`.big.scary`) and mixed with named attributes. Put a space before `#`: `input#go;` fails on Rust 2021 and later.
- No tag name before a `.class` or `#id` means `div` (since 0.21): write `#main { ... }`. `div #main { ... }` compiles too.
- Quote a class name that holds a symbol or starts with a digit: `."w-1/2"`. A hyphenated name (`.col-sm-2`) needs no quotes.
- In an edition-2024 crate (Rust 1.85) a quoted id with no space after `#` (`#"pinkie-123"`) is reserved syntax and does not compile: write `# "pinkie-123"` or `id="pinkie-123"`.
- Write each named attribute once. A repeat (`class="a" class="b"`) is no error in 0.27: both render and the browser keeps the first. Only a second `#id` is rejected. Merge classes instead: `.a.b`.
- An attribute name that is not a Rust identifier goes in quotes (since 0.26): `"@click"="open = true"`.

```rust
use maud::html;
let (locked, n, tip): (bool, u32, Option<&str>) = (true, 95, None);
let form = html! {
    // WRONG: a href=about.html { .. }      li class: "x" { .. }
    a href="about.html" { "About" }
    // WRONG: input disabled=true;          input checked?;
    input type="checkbox" name="cupcakes" checked;
    input type="submit" disabled[locked];
    // WRONG: input#go;                     class="big" class="scary"
    input #go .big.scary type="button" value="Launch";
    // WRONG: p title=(tip) { .. }          an Option does not splice
    p.cute[n > 50] title=[tip] { "Squee!" }
    #main {
        .tip { "No tag name: a div." }
        ."w-1/2" { "Quoted class name." }
    }
    button "@click"="open = true" { "Open" }
};
```

## Splices

- `(expr)` inserts a runtime value, HTML-escaped. It is the only interpolation: `{{name}}` or `${name}` inside a string literal renders as that literal text.
- A splice takes any `maud::Render` type (strings, integers, floats, `char`) and any `Display` type (since 0.25, still escaped). Implement `Render` only to override that default.
- A splice borrows its expression: splice a `String` variable bare, with no `.clone()`.
- `&T`, `Box<T>`, `Cow<str>` and `Arc<T>` (the `Arc` impl since 0.26) splice as they are: no `.clone()` first.
- Never call `.to_string()` just to splice. `maud::display(x)` (since 0.24) renders any value through its `Display` impl.
- An `Option` does not splice: use `@if let` or `attr=[opt]`.
- A splice holds one expression. Statements such as `let` need a block: `({ let x = ..; expr })`.
- In an attribute: `title=(value)`. To join literal and splice, wrap the parts in braces: `href={ (BASE) "/path" }`, no `format!`.
- In an id or class: `#(id)`, `.{ "color-" (severity) }`, not `class=(format!(..))`.

```rust
use maud::html;
const GITHUB: &str = "https://github.com";
let best_pony = "Pinkie Pie";
let numbers = [1, 2, 3, 4];
let (id, severity) = ("rarity", "critical");
let page = html! {
    // WRONG: p { "Hi, {{best_pony}}!" }    renders the braces as text
    p { "Hi, " (best_pony) "!" }
    p title=(best_pony) { "I have " (numbers.len()) " numbers, the first is " (numbers[0]) }
    p { ({ let total: i32 = numbers.iter().sum(); total * 2 }) }
    // WRONG: a href=(format!("{GITHUB}/lambda-fairy/maud")) { .. }
    a href={ (GITHUB) "/lambda-fairy/maud" } { "Fork me on GitHub" }
    aside #(id) {
        p.{ "color-" (severity) } { "This is the worst! Possible! Thing!" }
    }
};
```

## Control Flow

- Every control keyword takes an `@` prefix: `@if`, `@else`, `@for`, `@while`, `@match`, `@let`. A bare `if` / `for` / `while` / `match` / `let` inside `html!` is a compile error.
- Braces are mandatory on every `@if`, `@else`, `@for` and `@while` body. `@else` is optional.
- Render an `Option` with `@if let` plus `@else`; never `.unwrap()` or `.expect(..)` inside a splice.
- `@for pat in iter { ... }` loops over any iterator, a `.map(..)` chain after `in` included. Never build the items with `.map(|x| html! { .. })`; no `{{#each}}`.
- `@while cond { ... }` and `@while let PAT = EXPR { ... }` both work (since 0.13).
- `@match` arms use `=>` and accept full Rust patterns: or-patterns (`A | B`), bindings, ranges, destructuring, guards (`pat if cond =>`). An arm body is one element, one literal, one splice, an `@` control flow (`@if`, `@for`), or a `{ ... }` block. Prefer `@match` over an `@if` / `@else if` chain that tests each variant.
- `@let x = expr;` declares a variable inside `html!` (since 0.14), most useful inside loops. It accepts any Rust `let` pattern, type ascription included.
- `@match` and `@if` also work as an attribute or class value, no `@let` detour: `span class=@match n { 1 => "one", _ => "many" } { (n) }`, `p.@if n == 0 { "empty" } @else { "full" } { (n) }`.

```rust
use maud::html;
let role = "editor";
let nick: Option<&str> = Some("Pinkie Pie");
let names = ["Applejack", "Rarity", "Fluttershy"];
let mut queue = vec![1, 2].into_iter();
let page = html! {
    // WRONG: if role == "admin" { .. }         bare keyword
    // WRONG: @if role == "admin" h1 { .. }     branch without braces
    @if role == "admin" {
        h1 { "Super secret to-do list" }
    } @else if role == "editor" {
        p { "Drafts only." }
    } @else {
        p { "Nothing to see here; move along." }
    }
    // WRONG: p { "Hello, " (nick.unwrap()) "!" }   panics on None
    p { "Hello, " @if let Some(nick) = nick { (nick) } @else { "stranger" } "!" }
    ol {
        // WRONG: for name in &names { .. }      let shout = ..;
        @for name in &names {
            @let shout = name.to_uppercase();
            li { (name) " shouts " b { (shout) } }
        }
    }
    @while let Some(n) = queue.next() { span { (n) } }
    @match names.len() {
        0 => p { "Nobody here." },
        1 | 2 => "A quiet day.",
        n if n > 10 => { p { (n) " ponies: a crowd." } },
        _ => p { "A few ponies." },
    }
};
```

## Escaping and Raw HTML

- Splices and text are escaped by default. Maud escapes exactly four characters: `&`, `<`, `>`, `"`. Single quotes pass through unescaped (since 0.13).
- Never escape a value yourself before splicing it: it renders as visible `&amp;` entities.
- `maud::PreEscaped(x)` renders its inner value verbatim. Wrap only markup that is already sanitized or built by the program; on untrusted input it is an XSS hole. Never wrap an ordinary value in it.
- A raw HTML string spliced bare is escaped; untrusted HTML (rendered Markdown, rich text) is sanitized first: `PreEscaped(ammonia::clean(&dirty))`.
- Escaping is not context-aware: the same four characters are escaped everywhere, which is safe for HTML text only. Check the scheme of an outside URL before splicing it into `href` or `src`.
- Encode a value bound for `script`, `style` or an `on*` attribute for that context before the splice: a bare splice gets HTML escaping only, `PreEscaped` passes `</script>` through, and maud 0.27 ships no such encoder.
- `PreEscaped<T>` wraps any `T` (since 0.26) but splices only when `T: AsRef<str>`.

```rust
use maud::{html, PreEscaped};
let comment = "<script>alert(1)</script>"; // untrusted
let link = "javascript:alert(1)"; // untrusted
let icon = "<svg></svg>"; // built by the program
let href = if link.starts_with("https://") { link } else { "#" };
let page = html! {
    // WRONG: p { (PreEscaped(comment)) }   runs the script
    p { (comment) } // &lt;script&gt;alert(1)&lt;/script&gt;
    // WRONG: a href=(link) { .. }          escaping keeps `javascript:` intact
    a href=(href) { "Profile" }
    (PreEscaped(icon))
};
```

## Custom Rendering and Composition

### The `Render` Trait

Write a `maud::Render` impl to teach maud how to splice your own type. The trait has two methods, each with a default impl that calls the other:

- `fn render(&self) -> Markup`: override for the simple case.
- `fn render_to(&self, buffer: &mut String)`: override to write straight into the output buffer, without an intermediate `Markup`.

Rules:

- Override at least one. An impl that overrides neither compiles and recurses forever.
- Neither method takes a writer or returns `fmt::Result`.
- A `render_to` override does its own escaping: raw writes into `buffer` land unescaped. Write through `maud::Escaper`, which escapes as it writes.
- `render` and `render_to` are sync-only; there is no async `Render` trait and no streaming variant. Resolve async data (a DB or HTTP call) to a value before entering `html!` and splice the resolved value.
- Maud exports no `RenderOnce` trait (removed in 0.15; the name survives in `horrorshow`).

```rust
use maud::{html, Escaper, Markup, Render};
use std::fmt::Write as _;

struct Css(&'static str);
impl Render for Css {
    // WRONG: impl Render for Css {}   no method overridden: infinite recursion
    fn render(&self) -> Markup {
        html! { link rel="stylesheet" type="text/css" href=(self.0); }
    }
}

struct Debugged<T>(T);
impl<T: std::fmt::Debug> Render for Debugged<T> {
    fn render_to(&self, output: &mut String) {
        // WRONG: write!(output, "{:?}", self.0)   unescaped
        let mut escaper = Escaper::new(output);
        write!(escaper, "{:?}", self.0).expect("writing to a String cannot fail");
    }
}

let page = html! { (Css("site.css")) p { (Debugged(vec!["<b>"])) } };
```

### Components Are Just Functions

- A partial or component is a plain function returning `Markup`. Compose by splicing the call: `(header(title))`. There is no `partial!` macro and no include syntax.
- Type a parameter that carries markup as `Markup`, never `String` or `&str`: a string of HTML splices escaped.
- Splicing a `Markup` value never re-escapes it, so nesting components is safe.

```rust
use maud::{html, Markup, DOCTYPE};

fn header(title: &str) -> Markup {
    html! { head { title { (title) } } }
}

// WRONG: fn page(title: &str, body: String) -> Markup
fn page(title: &str, body: Markup) -> Markup {
    html! {
        (DOCTYPE)
        html {
            (header(title))
            body { (body) }
        }
    }
}

let markup = page("Home", html! { h1 { "Hello" } });
```

## Web Frameworks

Turn on the matching feature flag and `Markup` implements the framework's response trait. A handler then returns `Markup` directly. Tide is the exception: its feature converts `Markup` into a `tide::Response`, so the closure returns `Ok(html! { .. })`.

```toml
maud = { version = "0.27", features = ["axum"] }
```

| Framework | Feature flag | Trait `Markup` implements | Framework version |
|---|---|---|---|
| default | n/a | n/a | nothing enabled |
| Actix-web | `actix-web` | `actix_web::Responder` | `actix-web` `^4` |
| Axum | `axum` | `IntoResponse` | axum 0.8 (`axum-core` `^0.5`, `http` `^1`) |
| Rocket | `rocket` | Rocket's `Responder` | `rocket` `^0.5` |
| Warp | `warp` | `warp::Reply` | `warp` `^0.3.6` |
| Poem | `poem` | `poem::IntoResponse` | `poem` `^3` |
| Tide | `tide` (removed upstream after 0.27.0) | `From<PreEscaped<String>>` for `tide::Response` | `tide` `^0.16.0` |
| Submillisecond | `submillisecond` (since 0.27) | `IntoResponse` | `submillisecond` `^0.4.1` |
| Rouille | none | none | n/a |

- Pair maud 0.27 with the framework version in the table: the `Markup` impl targets that version only (axum 0.7 pairs with maud 0.26).
- Never hand-write a response impl for `Markup`, and never return `.into_string()` from a handler whose framework has a feature.
- A framework with no feature: pass the `Markup` to its response constructor (Rouille: `Response::html(..)`); call `.into_string()` only where it needs a `String`.
- Versions follow maud 0.27.0's manifest; verify against the crate's `Cargo.toml` when exact ranges matter.

```rust
// fragment
// Axum; also Poem (under `#[handler]`) and Submillisecond (a plain `fn` listed in `router!`)
async fn hello() -> Markup { html! { h1 { "Hello" } } }
// WRONG: async fn hello() -> String { html! { .. }.into_string() }   axum sends text/plain

// Actix-web: wrap the return in a Result
#[get("/")]
async fn index() -> actix_web::Result<Markup> { Ok(html! { h1 { "Hello" } }) }

// Rocket: the route returns Markup, the launch fn returns `_`
#[get("/<name>")]
fn greet(name: &str) -> Markup { html! { h1 { "Hello, " (name) "!" } } }
#[rocket::launch]
fn launch() -> _ { rocket::build().mount("/", routes![greet]) }

// Warp: a filter, not an `async fn`
let route = warp::any().map(|| html! { h1 { "Hello" } });

// Tide: the closure returns Ok(..); a bare `-> Markup` handler does not compile
app.at("/").get(|_req: tide::Request<()>| async move { Ok(html! { h1 { "Hello" } }) });

// Rouille: no feature flag
Response::html(html! { h1 { "Hello" } })
```

## Checklist

Run over every `html!` block, `Render` impl and handler in the diff:

- [ ] No angle brackets, no unquoted text, no hand-written `<!DOCTYPE html>`: elements use braces, text is quoted, the doctype is `(DOCTYPE)`.
- [ ] Every void element ends with `;`: no `{}` body, no `/`.
- [ ] Every `if`, `else`, `for`, `while`, `match` and `let` carries `@`; every `@if`/`@else`/`@for`/`@while` body has braces.
- [ ] Dynamic values are `(expr)` splices: no `{{x}}` or `${x}` in a string literal, no `.clone()` or `.to_string()` just to splice, no `format!` just to join a literal and a splice (a `format!` with a format spec, `{:.2}`, is fine).
- [ ] No `.unwrap()` or `.expect(..)` in a splice: `@if let` with `@else`, or `attr=[opt]`.
- [ ] Literal attribute values are quoted, splices are `=(value)` or `=[opt]`; boolean attributes are bare or `[cond]`, never `=true`; attr concatenation is wrapped in `{ }`; no attribute is written twice; a space precedes `#id`.
- [ ] `PreEscaped` wraps only sanitized or program-built markup; outside URLs are scheme-checked; values bound for `script`, `style` or `on*` are encoded for that context.
- [ ] Every `impl Render` overrides `render` or `render_to`; a `render_to` override writes through `Escaper`.
- [ ] Components are functions returning `Markup`; markup parameters are typed `Markup`.
- [ ] Handlers return `Markup` (Tide: `Ok(html! { .. })` from the closure), not `.into_string()`; the framework feature is on where the table lists one (Rouille has none) and the framework version matches the table; no `json` or `salvo` feature.
- [ ] Async data is resolved before `html!`; `Markup` reaches a `String` through `.into_string()`.

To update: re-verify every rule against the book and the API docs below, then diff for changes.

Book: https://maud.lambda.xyz API docs: https://docs.rs/maud
