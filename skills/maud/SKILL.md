---
name: maud
description: "Maud Rust HTML macro crate (html!, 0.27): splices, control flow, escaping, framework feature flags. Use when writing or debugging Maud templates or wiring up web-framework integration."
metadata:
  author: uwuclxdy
  version: "1.0"
---

# Maud (Rust HTML Macro)

> _Captured 2026-07-10 (maud 0.27.0). To update: re-verify against maud.lambda.xyz + docs.rs/maud, then diff for changes._

Maud is a compile-time HTML macro (`html!`); markup lives inline in Rust, type-checked at compile time. This skill targets **maud 0.27.x** (0.27.0, released 2025-02-02).

Maud runs on **stable Rust and nightly** (better error messages on nightly). Stable-Rust-capable since 0.22.1 (2020-11-02); earlier it needed nightly-only compiler features. MSRV is not documented.

---

## 1. Setup

### Cargo.toml

```toml
[dependencies]
maud = "0.27"
```

---

## 2. Rendering API

`html! { ... }` returns a `Markup` value. `Markup` is a type alias for `PreEscaped<String>`, a wrapper around an already-escaped HTML string.

| Operation | Result | Notes |
|---|---|---|
| `html! { ... }` | `Markup` | The macro expression's value. |
| `markup.into_string()` | `String` | Consumes the `Markup`, hands back the built string. |
| `(DOCTYPE)` inside `html!` | emits `<!DOCTYPE html>` | `maud::DOCTYPE` is a constant equal to the literal string `<!DOCTYPE html>`. |

```rust
use maud::{html, DOCTYPE};

let page = html! {
    (DOCTYPE)
    html {
        head { title { "My site" } }
        body { p { "Hello" } }
    }
};
```

Rendering a `Display` value: `maud::display(x)` is a free function that renders any value through its `Display` impl inside a template. It replaced the old blanket `Render for Display` impl removed in 0.24.0.

```rust
use maud::{html, display};

let n = 42;
html! { p { (display(n)) } };
```

Note: `Markup`/`PreEscaped` has no `Display` impl (checked against docs.rs 0.27; it implements `Render`, not `Display`). Convert to `String` with `.into_string()` when you need the raw string. There is no `html_to!` / write-into-buffer macro (`html_debug!` was removed in 0.25.0). To write into an existing buffer, use the `Render` trait's `render_to` (see §9).

---

## 3. Web Framework Integration

Turn on the matching feature flag from the table below and `Markup` implements the corresponding trait. A handler can then just return `Markup` directly.

| Framework | Feature flag | Trait `Markup` implements | Dep pins |
|---|---|---|---|
| default | — | — | nothing enabled |
| Actix-web | `actix-web` | `actix_web::Responder` | `actix-web-dep` + `futures-util` |
| Axum | `axum` | `IntoResponse` | `axum-core` `^0.5` + `http` `^1` |
| Rocket | `rocket` | Rocket's `Responder` | `rocket` `^0.5` |
| Warp | `warp` | `warp::Reply` | `warp` `^0.3.6` |
| Poem | `poem` | `poem::IntoResponse` | `poem` `^3` |
| Tide | `tide` | `From<PreEscaped<String>>` for `tide::Response` | `tide` `^0.16.0` |
| Submillisecond | `submillisecond` (new in 0.27.0) | `IntoResponse` | `submillisecond` `^0.4.1` |
| Rouille | manual, see below | none | — |

Dependency version pins came from the docs.rs feature graph, single source. Verify against `Cargo.toml` if exact ranges matter.

```toml
maud = { version = "0.27", features = ["axum"] }
```

### Handler Example

Rocket:
```rust
#[get("/<name>")]
fn hello(name: &str) -> Markup {
    html! { h1 { "Hello, " (name) "!" } }
}
```

Actix-web and Tide handlers wrap the return in a `Result`: Actix `async fn index() -> AwResult<Markup> { Ok(html! { ... }) }`; Tide returns `Ok(html! { ... })` from a closure inferred as `tide::Result<impl Into<Response>>` (its feature adds `From<PreEscaped<String>>`, not `IntoResponse`, so a bare `-> Markup` handler won't compile). Axum, Poem, Submillisecond return `Markup` directly from a sync or async handler. The trait impl converts it to the response type each one expects.

### Manual Path (No Feature Flag)

Call `.into_string()` and wrap the string yourself.

```rust
// Rouille has no trait impl:
Response::html(html! { h1 { "Hello, " (name) "!" } })
```

---

## 4. Elements and Nesting

Elements with content use braces; text and nested elements go inside.

Void elements end with `;` and take no body. Maud emits HTML5 syntax (`<br>`), not XHTML (`<br />`).

```rust
html! {
    link rel="stylesheet" href="poetry.css";
    p {
        "Rock, you are a rock."
        br;
        "Gray, you are gray,"
    }
}
```

Elements and attributes with hyphens are supported (custom elements, `data-*`, ARIA).

### Text

Plain double-quoted Rust string literals are bare expressions inside `html!`. Raw string literals handle long or special-character text.

```rust
html! {
    pre {
        r#"
            Rocks, these are my rocks.
            Smooth and round,
            Asleep in the ground.
        "#
    }
}
```

---

## 5. Attributes

Value attribute: `name="value"`.

```rust
html! {
    a href="about:blank" { "Apple Bloom" }
    li class="lower-middle" { "Sweetie Belle" }
}
```

Boolean / empty attribute: bare name, no `=`.

```rust
html! {
    input type="checkbox" name="cupcakes" checked;
    label for="cupcakes" { "Do you like cupcakes?" }
}
```

### `#id` / `.class` Shorthand

```rust
html! {
    input #cannon .big.scary.bright-red type="button" value="Launch";
    div."col-sm-2" { "Bootstrap column!" }
}
```

- Multiple classes chain: `.big.scary.bright-red`.
- Quoted names allow characters not valid as bare idents: `."col-sm-2"`.
- Rust 2021 whitespace gotcha: `#` must be preceded by a space (`input #pinkie;`). Older editions allowed `input#pinkie;`.

### Implicit `div`

Omitting the tag name when a `#id` / `.class` shorthand is present defaults the element to `div`.

```rust
html! {
    #main {
        "Main content!"
        .tip { "Storing food in a refrigerator can make it 20% cooler." }
    }
}
```

### Toggles `[condition]`

A bracketed bool expression toggles a boolean attribute or a class on or off.

```rust
let allow_editing = true;
html! {
    p contenteditable[allow_editing] { "Edit me." }
}

let cuteness = 95;
html! {
    p.cute[cuteness > 50] { "Squee!" }
}
```

### Optional Attribute Values `attr=[Option<T>]`

With `=`, a bracketed `Option` sets the attribute's value only when `Some`. `None` omits the attribute entirely. This differs from bare `[cond]`, which toggles presence.

```rust
html! {
    p title=[Some("Good password")] { "Correct horse" }

    @let value = Some(42);
    input value=[value];

    @let title: Option<&str> = None;
    p title=[title] { "Battery staple" }   // title omitted
}
```

### Dynamic Names

Splice a computed id with `#(...)`. Build a class from a literal plus splice inside `.{ }`.

```rust
let name = "rarity";
let severity = "critical";
html! {
    aside #(name) {
        p.{ "color-" (severity) } { "This is the worst! Possible! Thing!" }
    }
}
```

---

## 6. Splices and Interpolation

`(expr)` inserts a runtime value into markup. HTML special characters in the value are escaped by default.

```rust
let best_pony = "Pinkie Pie";
let numbers = [1, 2, 3, 4];
html! {
    p { "Hi, " (best_pony) "!" }
    p {
        "I have " (numbers.len()) " numbers, "
        "and the first one is " (numbers[0])
    }
}
```

Splice any type that has a `maud::Render` impl. Most primitives (`str`, `i32`, ...) already do.

Block-expression splice for arbitrary Rust logic:

```rust
html! {
    p {
        ({
            let f: Foo = something_convertible_to_foo()?;
            f.time().format("%H%Mh")
        })
    }
}
```

### Splices in Attributes

Single value with `=`:

```rust
let secret_message = "Surprise!";
html! {
    p title=(secret_message) { "Nothing to see here." }
}
```

Concatenating literal plus splice needs `{ }` wrapping:

```rust
const GITHUB: &'static str = "https://github.com";
html! {
    a href={ (GITHUB) "/lambda-fairy/maud" } { "Fork me on GitHub" }
}
```

---

## 7. Control Structures

Every control keyword takes an `@` prefix. Bare `if` / `for` / `match` / `let` are not recognized as control flow inside `html!`. Braces are mandatory on every branch.

### `@if` / `@else if` / `@else`

```rust
#[derive(PartialEq)]
enum Princess { Celestia, Luna, Cadance, TwilightSparkle }

let user = Princess::Celestia;
html! {
    @if user == Princess::Luna {
        h1 { "Super secret woona to-do list" }
        ul { li { "Evil laugh" } }
    } @else if user == Princess::Celestia {
        p { "Sister, please stop reading my diary." }
    } @else {
        p { "Nothing to see here; move along." }
    }
}
```

`@if let` works (the condition is a plain Rust expression, so `let PAT = EXPR` parses natively):

```rust
let user = Some("Pinkie Pie");
html! {
    p {
        "Hello, "
        @if let Some(name) = user { (name) } @else { "stranger" }
        "!"
    }
}
```

### `@for`

```rust
let names = ["Applejack", "Rarity", "Fluttershy"];
html! {
    ol {
        @for name in &names {
            li { (name) }
        }
    }
}
```

### `@while`

Present in the parser AST (`WhileExpr`), absent from the published book. No documented example exists. Structure matches `@if`, so `@while cond { ... }` and by analogy `@while let PAT = EXPR { ... }` are expected to work. Treat `@while let` as unverified until you compile it.

### `@match`

```rust
html! {
    @match user {
        Princess::Luna => h1 { "Woona's here" },
        Princess::Celestia | Princess::Cadance => p { "A princess." },
        _ => p { "Nothing to see here; move along." }
    }
}
```

Reuses the `Princess` enum and `user` binding from `@if` above. Match arms accept full Rust patterns per the parser source: or-patterns (`A | B`, shown above), bindings, ranges, destructuring, guards (`pat if cond =>`). The book shows only basic arms, so verify guard / or-pattern arms by compiling.

### `@let`

Declares a variable inside `html!`, most useful inside loops. Accepts any Rust `let` pattern including type ascription.

```rust
let names = ["Applejack", "Rarity", "Fluttershy"];
html! {
    @for name in &names {
        @let first_letter = name.chars().next().unwrap();
        p {
            "The first letter of " b { (name) } " is " b { (first_letter) } "."
        }
    }
}
```

---

## 8. Escaping and Raw HTML

Splices and text are escaped by default. Maud escapes exactly four characters: `&`, `<`, `>`, `"`. Single quotes pass through unescaped.

Bypass escaping with `maud::PreEscaped`, which renders its inner value verbatim.

```rust
use maud::PreEscaped;
html! {
    "<script>alert(\"XSS\")</script>"                // &lt;script&gt;...
    (PreEscaped("<script>alert(\"XSS\")</script>"))  // <script>...
}
```

Only wrap content you have already sanitized. `PreEscaped` on untrusted input is an XSS hole. The `AsRef<str>` bound restriction on `PreEscaped` was removed in 0.26.0, so it wraps a wider range of inner types now.

---

## 9. Custom Rendering and Composition

### The `Render` Trait

Write a `maud::Render` impl to teach maud how to splice your own type. The trait has two methods, both with default impls that call each other:

```rust
pub trait Render {
    fn render(&self) -> Markup {
        let mut buffer = String::new();
        self.render_to(&mut buffer);
        PreEscaped(buffer)
    }

    fn render_to(&self, buffer: &mut String) {
        buffer.push_str(&self.render().into_string());
    }
}
```

Override at least one. Overriding neither causes infinite recursion (each default calls the other). Override `render` for the simple case. Override `render_to` when you want to write straight into the output buffer, for example to append multiple pieces without an intermediate `Markup`.

A `render_to` override is responsible for its own escaping. Raw writes into `buffer` are not escaped for you. Need that inside one? Reach for `maud::Escaper`, it escapes as it writes.

### Components Are Just Functions

A partial or component is a plain function returning `Markup`. Compose by splicing the call.

```rust
use maud::{html, Markup, DOCTYPE};

fn header(title: &str) -> Markup {
    html! {
        head { title { (title) } }
    }
}

fn page(title: &str, body: Markup) -> Markup {
    html! {
        (DOCTYPE)
        html {
            (header(title))
            body { (body) }
        }
    }
}

// usage
let markup = page("Home", html! { h1 { "Hello" } });
```

Splicing a `Markup` value never re-escapes it, so nesting components is safe. Maud does not currently export a `RenderOnce` trait (it had one from 0.8.0 through 0.15.0, removed 2017-01-26); don't confuse the name with horrorshow's still-existing `RenderOnce` trait.

---

## 10. Gotchas and Footguns

Each is flagged inline at its section; §11 consolidates. Index:

- Void `;` not self-close; control flow needs `@` (every branch braced) — §4, §7
- `[cond]` (toggle) vs `attr=[Option<T>]` (value only when `Some`); attr concat needs `{ }` — §5, §6
- Splices escape by default; `PreEscaped` is an XSS hole on untrusted input; only `&` `<` `>` `"` escaped (single quote not) — §6, §8
- Rust 2021 `#` spacing (`input #pinkie;`) — §5
- `Render` with neither method overridden recurses forever; a `render_to` override does its own escaping (`maud::Escaper`) — §9
- `Markup` has no `Display` impl (`.into_string()` / `maud::display(x)`); no template files, no `html_to!` — §2

---

## 11. Quick Reference Card

```
Value:         html! { ... } -> Markup          Get String: .into_string()
Doctype:       (DOCTYPE)                          -> <!DOCTYPE html>
Element:       p { "text" nested { } }
Void element:  br;   link rel="x" href="y";       (trailing ; , renders <br>)
Text:          "literal"   r#"raw literal"#
Attr:          name="value"
Bool attr:     checked        (bare name, no =)
Shorthand:     input #id .class1.class2;          .class -> implies <div> if no tag
Toggle:        p contenteditable[cond] { }        p.cute[n > 50] { }
Optional attr: input value=[Some(42)];            title=[opt]  (None omits attr)
Splice:        (expr)                             escapes by default
Attr splice:   title=(x)   href={ (a) "/" (b) }
Dyn name:      #(id_expr)   .{ "color-" (sev) }
Block splice:  ({ let x = f()?; x })
If:            @if c { } @else if d { } @else { }
If let:        @if let Some(x) = opt { (x) } @else { }
For:           @for x in &xs { li { (x) } }
Match:         @match v { A => { }, _ => p { } }  (guards / or-pats via Rust patterns)
While:         @while cond { }                    (@while let unverified)
Let:           @let x = expr;                      @let y: Option<&str> = None;
Raw HTML:      (PreEscaped(safe_html))            disables escaping
Display value: (display(x))
Component:     fn c(...) -> Markup { html! { } }   splice with (c(...))
Render trait:  fn render(&self) -> Markup          fn render_to(&self, buf: &mut String)  (both have default impls)
Escapes:       & < > "   (single quote NOT escaped)
```

Book: https://maud.lambda.xyz
API docs: https://docs.rs/maud
