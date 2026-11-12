---
name: askama
description: "Askama Rust templating reference (0.16)."
metadata:
  author: uwuclxdy
  version: "1.6"
---

# Askama (Rust Templating)

Load before writing or reviewing an askama template (`{{ .. }}` / `{% .. %}` files under `templates/`) or Rust code that derives `askama::Template`.
Askama is a compile-time, Jinja-like template engine for Rust: templates are parsed at build time and generate type-checked Rust code. Rules hold for the unified `askama` crate, version 0.16.x (MSRV 1.88); a rule tagged with a version does not apply to an older askama pinned in `Cargo.toml`.

> _Captured 2026-11-11 (askama 0.16.1). To update: re-verify against the askama book + docs.rs/askama._

## 1. Current State & Setup

```toml
[dependencies]
askama = "0.16"
# For web frameworks, ADD askama_web separately (see §3):
askama_web = { version = "0.16", features = ["axum-0.8"] }
```

- Do not depend on `askama_axum`, `askama_actix`, `askama_warp`, or `askama_rocket` (removed when 0.13 unified them), nor `askama_gotham` / `askama_tide` (abandoned since 2023 on askama ^0.12). There is no `askama_actix_web` crate.
- `rinja` and `rinja_axum` are deprecated (2024 fork, re-unified as `askama` in early 2025): migrate to `askama` / `askama_web`.
- MSRV: 1.81 through 0.13.x, 1.83 in 0.14, 1.88 since 0.15.

### Features

Default: `config` (reads `askama.toml`), `derive`, `std`, `urlencode`. Opt-in: `serde_json` (the `json` filter), `code-in-doc` (`in_doc`); `full` = default + both. A gated filter does not resolve until its feature is on:

```toml
# WRONG when a template uses {{ data | json }}
askama = "0.16"
# RIGHT
askama = { version = "0.16", features = ["serde_json"] }
```

- Spell it `serde_json` (underscore, since 0.13); `serde-json` no longer exists.
- Removed in 0.13: features `humansize`, `markdown`, `serde-yaml`. The size filter is `filesizeformat`, always available; there is no `humansize` filter. Use `comrak` / `yaml-rust2` directly.
- `#![no_std]`: without the `std` feature `write_into()` is gone, without `alloc` also `render()` and many filters. Render with `render_into` into a `core::fmt::Write` sink, never an `io::Write` cursor.

### Minimal Example

```rust
// fragment
use askama::Template;

#[derive(Template)]
#[template(path = "hello.html")] // templates/hello.html holds: Hello, {{ name }}!
struct HelloTemplate<'a> { name: &'a str }

HelloTemplate { name: "world" }.render()? // -> Result<String, askama::Error>
```

- Templates live in `templates/` at the crate root (next to `Cargo.toml`) by default. Override via `askama.toml` (see §11).
- Name each struct field exactly as the template names the variable: `{{ name }}` reads field `name`.
- `path` is relative to the template directory, never to the crate root.
- `source` always needs `ext`: with no file there is no extension to pick the escaper from.

```rust
// fragment
#[template(path = "templates/hello.html")]            // WRONG: looks for templates/templates/hello.html
#[template(path = "hello.html")]                      // RIGHT
#[template(source = "Hello {{ name }}")]              // WRONG: no `ext`, does not compile
#[template(source = "Hello {{ name }}", ext = "txt")] // RIGHT
```

## 2. Rendering API: Use the Right Method

| Method | Output | When to use |
|---|---|---|
| `tmpl.render()` | `Result<String, askama::Error>` | Default. Allocates a new `String`. |
| `tmpl.render_into(&mut writer)` | writes into `impl fmt::Write` | Reusing a buffer, nested rendering. |
| `tmpl.write_into(&mut writer)` | writes into `impl io::Write` | Writing directly to a socket / file. |

- Never render with `.to_string()` or `format!("{}", tmpl)`: they route through a vtable at runtime and run 100-200% slower.
- A custom type printed in a hot template: implement `askama::FastWritable` (`fn write_into(&self, dest: &mut dyn fmt::Write, _: &dyn askama::Values) -> askama::Result<()>`) beside `Display`; askama prefers it. `Display::fmt` delegates: `askama::FastWritable::write_into(self, f, askama::NO_VALUES)?; Ok(())`. There is no `Values::new()`.
- Trait objects: use `&dyn askama::DynTemplate` and its `dyn_render()` / `dyn_render_into()`. `Template` is not dyn-compatible, so `Box<dyn Template>` does not compile.
- There is no `size_hint` attribute: `#[template(size_hint = ...)]` is a compile error (`unsupported template attribute`). The derive computes `SIZE_HINT` from the template's static text for `render()` to preallocate; override it only by hand-implementing `Template`.
- **Removed in 0.13+**: the `Template::EXTENSION` and `Template::MIME_TYPE` associated fields no longer exist.
- Runtime values that aren't on the struct: `tmpl.render_with_values(&values)` with a `HashMap<&str, Box<dyn Any>>` or one `(&str, &dyn Any)` tuple; plain `render()` passes none. The template pins the type and handles the `Result` (wrong type or unset key is an `Err`):

```
{% if let Ok(name) = "name"|value::<&str> %}name is {{ name }}{% endif %}
{% if let Ok(age) = askama::get_value::<u32>("age") %}age is {{ age }}{% endif %}
```

## 3. Web Framework Integration

**Two paths. Pick one.**

### Path A: Manual (Simplest, No Extra Crate)

Call `.render()`, wrap the string in the framework's HTML response type, and propagate the `askama::Error`.

```rust
// fragment
use axum::response::{Html, IntoResponse};

async fn index() -> Result<impl IntoResponse, AppError> {
    Ok(Html(IndexTemplate { title: "Home" }.render()?))
}
// WRONG: `-> Result<String, AppError>` with `Ok(tmpl.render()?)` sends no HTML content type.
```

- `AppError: IntoResponse` and `AppError::from(askama::Error)` must exist, e.g. a `thiserror` variant `Render(#[from] askama::Error)`. Never `.map_err(|e| e.into_box())` on every render call.

### Path B: `askama_web` with `WebTemplate`

One derive implements the response trait for whichever feature flag you turned on. Never hand-write `IntoResponse` / `Responder` / `Reply` per template struct.

```rust
// fragment
#[derive(askama::Template, askama_web::WebTemplate)]
#[template(path = "hello.html")]
struct HelloTemplate { name: String }

async fn hello() -> HelloTemplate { HelloTemplate { name: "world".into() } }
```

Returns `200 OK`, `Content-Type: text/html; charset=utf-8`. Render errors become `500` with no stylized error page; use Path A when the error page must be styled.

**Per-target feature flags for askama_web**: `axum-0.8` / `axum-0.7` / `axum-core-0.5` / `axum-core-0.4`, `actix-web-4`, `rocket-0.5`, `warp-0.4` / `warp-0.3`, `poem-3`, `trillium-0.2`, `cot-0.3` / `cot-0.4` / `cot-0.5` / `cot-0.6` / `cot_core-0.6`. Also `derive` (WebTemplate derive, on by default), `eprintln`, and the logging-backend flags `log-0.4` / `tracing-0.1` (one of each, shared across all integrations).

## 4. `#[template(...)]` Attribute Options

| Key | Example | Purpose |
|---|---|---|
| `path` | `path = "hello.html"` | File in templates dir. Extension drives escaping. |
| `source` | `source = "Hi {{ name }}"` | Inline template; requires `ext`. |
| `ext` | `ext = "html"` | Extension used to pick the escaper (§12). |
| `escape` | `escape = "none"` or `"html"` | Override auto-escape. |
| `whitespace` | `whitespace = "suppress"` | Per-template WS mode (`"preserve"` / `"suppress"` / `"minimize"`); overrides `askama.toml`. |
| `syntax` | `syntax = "foo"` | Use a custom syntax defined in `askama.toml`. |
| `config` | `config = "config.toml"` | Override config path (default `askama.toml`). |
| `print` | `print = "code"` / `"ast"` / `"all"` / `"none"` | Compile-time debug: prints the parsed AST and/or generated code to stderr. |
| `block` | `block = "hello"` | Render just one block of the file; no second template needed. Fields outside that block aren't required. Good for HTMX fragments. |
| `blocks` | `blocks = ["title", "content"]` | Generates one `as_<block>()` method per block, each returning `impl Template + '_`: `page.as_title().render()`. |
| `in_doc` | `in_doc = true` | Source is in the item's doc comment (inside an ```askama fenced block). Requires `ext` and the `code-in-doc` feature. |
| `askama` | `askama = $crate::__askama` | Override the `askama` crate path. Needed when re-exporting from a macro-defining crate. |

- Cannot combine `path` and `source`.
- `path` and `source` must be string literals known at compile time, the same constraint `{% include %}` paths have (§10): no template chosen at runtime from a variable.
- `#[derive(Template)]` works on an enum: each variant may carry its own `#[template(...)]`. A variant without one needs an enum-level `#[template(...)]` as its default.

## 5. Expressions

### Literals and Types
- `{{ expr }}` prints only types that implement `Display`. Tuple `(1, 2)`, array `[1, 2, 3]` and array-repeat `[0; 4]` (0.15) literals are values for `let` and call arguments; `for` iterates the array forms, never a tuple. `{{ (1, 2) }}` does not compile.
- Struct construction: `{{ MyStruct { field1: 1, field2: "x" }.to_string() }}`. Struct expressions are values, not just via `.to_string()` (0.15): `{{ Point { x: 1, y: 2 } }}`. Struct-update syntax works: `{{ Point { x: 1, ..Default::default() } }}`.

### Variable Access
- `{{ name }}`: field on template struct; `{{ user.name }}`: dotted path (fields or methods); `{{ crate::MAX_USERS }}`: constants from your crate.
- Reading follows Rust borrow rules. Methods can be called; beware self-recursion: `{{ self }}` or a method returning `self` overflows the stack through `Display`.
- `{% if x is defined %}` / `is not defined` tests plain variables only. `{% if x.y is defined %}` does not compile.
- There is no `length` filter: call `{{ items.len() }}`.

### Operators (Mostly like Rust)
- **Bitwise are RENAMED** (since 0.13, to avoid filter-pipe conflict): `|` -> `bitor`, `&` -> `bitand`, `^` -> `xor`. Precedence unchanged.

```
{% if my_bitset & 1 != 0 %}set!{% endif %}       {# WRONG #}
{% if my_bitset bitand 1 != 0 %}set!{% endif %}  {# RIGHT #}
```

- **Prefix `&` and `*`** reference and dereference as in Rust: `{% let x = &"bla" %}{% if *x == "bla" %}yes{% endif %}`. The `bitand` rename covers binary `&` only.
- **Concat `~`**: `{{ a ~ b ~ c }}` is shorthand for `{{ a }}{{ b }}{{ c }}`. **Must have spaces around it** to disambiguate from whitespace control; `{{ a~b }}` breaks.
- **`as` cast**: `{{ x as i64 }}`. Only primitive types. Automatically derefs `&&&bool` etc.
- **`?` works on `Result` only**, never on `Option`:

```
{{ some_result? }}
{{ some_option? }}                                            {# WRONG: does not compile #}
{% if let Some(value) = some_option %}{{ value }}{% endif %}  {# RIGHT #}
```

### Function and Method Calls
- `{{ method() }}` -> `self.method()` (method on the template struct). A bare name is always taken as a method.
- `{{ self::function() }}` -> free function in the current module
- `{{ super::b::f() }}`, `{{ crate::utils::f() }}` -> function in another module
- `{{ (closure)(12) }}` -> calling a closure stored in a field; parens required
- `{{ some_macro!(field) }}` -> Rust macro. **Askama won't infer field references inside macro args.** Bind the field first: `{% let field = field %}`.

```
{{ foo(123) }}        {# WRONG for a free function: compiled as self.foo(123) #}
{{ self::foo(123) }}  {# RIGHT #}
```

## 6. Control Flow

### if / else if / else
`{% if a %}…{% else if b %}…{% else %}…{% endif %}`. `{% elif b %}` is the same as `{% else if b %}`.

### for
`{% for user in users %}<li>{{ user.name }}</li>{% endfor %}`

- **Filter clause**: `{% for user in users if user.active %}`
- **Else clause** (runs if iter was empty or all filtered out); use it instead of an `{% if %}` guard around the loop: `{% for u in users %}...{% else %}No one here.{% endfor %}`
- `{% break %}` and `{% continue %}` work inside a loop.
- **Loop variables** (the complete list; Askama exposes fewer of them than Jinja does): `loop.index` (1-based), `loop.index0` (0-based), `loop.first`, `loop.last`. Use them instead of a hand-rolled `let mut` counter.
- `loop.cycle(seq)` (method call): `{{ loop.cycle(["a", "b"]) }}` cycles per iteration. `seq` may be a variable holding an array or slice; an empty array literal is a compile error.
- No `loop.length`, `loop.revindex`, `loop.changed`, `loop.previtem`, `loop.nextitem`. If you need these, compute in Rust or use modulo on `loop.index`.

### match / when (for Enums, Options, Results)
A `{% match %}` must be exhaustive and non-empty: cover every case or end with `{% else %}` (sugar for `{% when _ %}`).

```
{% match result %}{% when Ok(val) %}Good: {{ val }}.{% endmatch %}                {# WRONG: no arm for Err #}
{% match result %}{% when Ok(val) %}Good: {{ val }}.{% else %}Bad.{% endmatch %}  {# RIGHT #}
```

- `with` is optional: `{% when Some with (val) %}` and `{% when Some(val) %}` are both valid; do not rewrite one into the other.
- Variant patterns: literal `{% when Some with ("foo") %}`, tuple `{% when Variant with (a, b) %}`, struct `{% when Variant { field } %}` or `{% when Variant { field: val } %}` to rename, enum path `{% when Self::Circle { radius } %}`.
- Other patterns: slice with rest `{% when [first, ..] %}`, literal `{% when 3 %}`, alternatives `{% when 1 | 4 | 86 %}`, wildcard `{% when _ %}` or `{% else %}`.
- Text inside a `{% match %}` belongs to an arm: between `{% match %}` and the first `{% when %}`, and between an `{% endwhen %}` and the next tag, only whitespace and `{# comments #}` may appear; anything else does not compile. `{% endwhen %}` (closing an arm, for djLint) is optional.

### Assignments and Variable Declarations
```
{% let name = user.name %}     {# immutable binding #}
{% let mut it = xs.iter() %}   {# mutable binding #}
{% set x = 4 %}                {# alias for let (Jinja compat) #}
{% let n: u32 = 12 %}          {# type annotation, as in Rust #}
{% decl val %}                 {# declare WITHOUT value; let/set can't since 0.16 #}
{% if cond %}{% let val = "a" %}{% else %}{% let val = "b" %}{% endif %}
{{ val }}
```
- **`decl` (alias `declare`) is the only valueless declaration since 0.16.** Bare `{% let x %}` / `{% set x %}` with no `=` now starts a *let/set block* instead.
- **let/set blocks (0.16)** capture a rendered block into a `String` variable, instead of building it with `format!` in Rust: `{% let heading %}{{ title }} on {{ site }}{% endlet %}`, then `{{ heading }}`.
- **Compound assignment uses the `{% mut %}` tag (0.16)**, not bare `let`: `{% mut counter += i %}`. Every Rust compound operator (`+=`, `-=`, `*=`, …) works; the target must be a `mut` binding.

```
{% let counter = 0 %}{% mut counter += 1 %}      {# WRONG: counter is not mut #}
{% let mut counter = 0 %}{% mut counter += 1 %}  {# RIGHT #}
```

- Shadowing is allowed, same as Rust: a second `{% let x = .. %}` / `{% set x = .. %}` makes a new binding, it does not mutate the old one.
- `{% let x = obj.field %}` holds a reference; a plain variable, a filtered value, an expression ending in `?` (`x?`) or a multi-part expression is moved or copied (since 0.14). Dereference to compare: `{% if x | deref == String::from("b") %}`.
- **Do not prefix variables with `__askama`, name one `caller` (reserved since 0.15), or use Rust keywords.**

### Filter Blocks
Apply one or more filters to a whole block instead of repeating the chain on every expression: `{% filter lower | capitalize %}{{ t }} / HELLO / {{ u }}{% endfilter %}`

### Raw Blocks
`{% raw %}{{ shown as-is }}{% endraw %}` prints its content verbatim, without templating.

## 7. Whitespace Control: Three Operators, Not One

| Operator | Name | Effect |
|---|---|---|
| `-` | suppress | Remove all whitespace on that side |
| `~` | minimize | Collapse to a single space/newline |
| `+` | preserve | Keep whitespace as-is (overrides config) |

Usage: put right after `{%`/`{{` or right before `%}`/`}}`, inside the delimiter: `{%- if x %}` strips before the tag, `{% for x in xs ~%}` minimizes after it. `{~% if x %}` is literal text.

- Nothing is trimmed by default (no Jinja `trim_blocks`): `preserve` renders every newline and indent around a tag; only one trailing newline of the template is dropped. Add `-` where output must be tight; use `~` where one newline or space must survive.
- Precedence: inline operator > `#[template(whitespace = ...)]` > `askama.toml`.
- When two inline controls point at the same span, **Suppress always wins**; between Minimize and Preserve, whichever operator sits on the tag AFTER the gap wins (positional; the book's flat `Suppress > Minimize > Preserve` table is wrong there).
- Whitespace control on `{% extends %}` is an accepted no-op, **not** a compile error (the book's "rejected" is stale).

## 8. Comments

Nested block comments are supported: `{# outer {# nested #} still in outer #}`

## 9. Inheritance (extends / block / super)

`base.html`:
```
<title>{% block title %}{{ title }} · Site{% endblock %}</title>
<main>{% block content %}<p>default</p>{% endblock %}</main>
```

`page.html`:
```
{% extends "base.html" %}
{% block title %}Index{% endblock %}
{% block content %}
  {{ super() }}   {# inject the parent block's contents #}
  <h1>Hello!</h1>
{% endblock %}
```

A child template puts all of its markup inside `{% block %}` overrides. The extending template's top-level content outside blocks is ignored, with no compile error:

```
{% extends "base.html" %}
<h1>Index</h1>                                   {# WRONG: never rendered #}
{% block content %}<h1>Index</h1>{% endblock %}  {# RIGHT #}
```

- `{% extends %}` must be the first tag of the template.
- An overriding block replaces the parent block; call `{{ super() }}` inside it to keep the parent's contents.
- Multi-layer inheritance is supported. A base template must define at least one block for inheritance to work.
- Askama looks for the extended template relative to the extending one first, then relative to the config'd template dirs.
- Put `{% block %}` at the top level or inside another block. The book forbids blocks inside `if`/`else`/`for`; 0.16 compiles them and inheritance overrides correctly, but top-level or block-nested stays the safe form.
- Duplicate `{% block %}` names in the same template are a hard compile error since 0.16, previously only a warning.

## 10. Includes, Macros, and Composition

### `{% include %}`
`{% for item in items %}{% include "item.html" %}{% endfor %}`
- Path must be a string literal (known at compile time). Lookup: relative to including template first, then template dirs.
- The included template has full access to the caller's scope, including loop locals.

### Macros
Define with `{% macro heading(arg) %}<h1>{{ arg }}</h1>{% endmacro %}` (optional named endmacro: `{% endmacro heading %}`), call with `{{ heading("Title") }}`.
- **Expression-call syntax (0.15)** is the call form for a macro without a `caller` body (named args allowed too). `{% call heading("Title") %}` with no body and no `{% endcall %}` does not parse.
- Macro args can carry default values and type annotations (0.15/0.16): `{% macro test(value: Option<u32>, extra: Option<u32> = None) %}`.
- Named arguments (must come AFTER positional): `{{ h(bold="x", arg="y") }}`
- Import macros from another file: `{%- import "macros.html" as m -%}`, then `{{ m::heading("hi") }}`.
- Put `{% macro %}` and `{% import %}` at the template's top level: below it (e.g. inside a `{% block %}`) they are a compile error.

### Call-Block Syntax (Macros with Inner Content)
```
{% macro card() %}<div class="card">{{ caller() }}</div>{% endmacro %}

{% call card() %}
  <p>Body passed into the macro.</p>
{% endcall %}
```
`caller()` inside the macro renders the block passed to `{% call %}...{% endcall %}`. With arguments: `{% call(user) dump_users(list) %}...{% endcall %}` makes the macro's `caller(user)` render the body once per invocation. Guard an optional body with `{% if caller is defined %}`.

### Nested and Recursive Templates
- Render-in-place: embed a Template-derived type as a field (`struct Outer { s1: Inner }`); `{{ s1 }}` auto-renders via its `Display` impl. In an HTML outer template write `{{ s1 | safe }}`, or the inner markup is escaped (`&#60;div&#62;`).
- Self-include does NOT work. Recurse with an explicit `.render()` call on a field of the template's own type (`children: &'a [Item<'a>]`): `{% for child in children %}{{ child.render()? | safe }}{% endfor %}`. An HTML template escapes the child's markup without `| safe`; `escape = "none"` needs none. Prefer a custom iterator + plain loop when possible.

## 11. Configuration: `askama.toml`

Place at crate root (next to `Cargo.toml`). All sections are optional.

```toml
[general]
dirs = ["templates"]      # default; globs OK (0.16): ["templates/*"], ["templates/**"]
whitespace = "preserve"   # or "suppress" | "minimize"

[[syntax]]                # custom delimiters (e.g. to avoid collisions with LaTeX or Vue)
name = "vue"
block_start = "[%"
block_end = "%]"
expr_start = "[["
expr_end = "]]"
comment_start = "[#"
comment_end = "#]"

[[escaper]]               # apply askama::filters::Text (no escaping) to .js files
path = "askama::filters::Text"
extensions = ["js"]
```

- Use a custom syntax per-template with `#[template(path = "...", syntax = "vue")]`, or for every template with `default_syntax = "vue"` under `[general]`.
- Each delimiter value is at least two characters; an omitted key keeps the default delimiter.
- An `[[escaper]]` `path` must name a type in scope of the template that implements `askama::filters::Escaper`. An extension that no `[[escaper]]` block and no default covers (`.js`, `.kml`) is a compile error, never a silent HTML fallback.

## 12. Auto-Escaping

The file extension (or `ext`) picks the escaper:
- HTML escaper: `askama`, `html`, `htm`, `j2`, `jinja`, `jinja2`, `rinja`, `svg`, `xml`
- Text (no escape): `md`, `yml`, `none`, `txt` (and the empty extension)

Askama escapes `<`, `>`, `&`, `"`, `'` per OWASP recommendations when the extension implies HTML. Never pre-escape a value in Rust (it renders as `&#38;lt;`) and never switch escaping off to let one value through:

```
{{ user_bio }}             {# RIGHT: escaped automatically #}
{{ trusted_html | safe }}  {# RIGHT: one trusted expression #}
{{ user_bio | safe }}      {# WRONG: untrusted input, XSS #}
```

`json` output goes bare into a double-quoted attribute; with `| safe` it goes bare into `<script>`, a single-quoted attribute or HTML text (`<pre>`):

```
<li data-extra="{{ data | json }}">                      {# RIGHT #}
<script>var data = {{ data | json | safe }};</script>    {# RIGHT #}
<script>var data = "{{ data | json | safe }}";</script>  {# WRONG: quoted inside <script> #}
<li data-extra="{{ data | json | safe }}">               {# WRONG: `safe` inside a double-quoted attribute #}
```

- Per-template override: `#[template(escape = "html")]` or `escape = "none"`, instead of renaming the file.
- `impl askama::filters::HtmlSafe for MyType {}` only on a type whose `Display` never emits `<`, `>`, `&`, `"`, `'`: it skips escaping as a speed-up, never a guarantee. Where output must stay unescaped, write `| safe`.
- `{{ value | escape }}` or `{{ value | e }}` applies the template's own escaper. In an `escape = "none"` template a bare `| e` escapes nothing: write `| e("html")`.

## 13. Built-in Filters

All filters use `value | filter_name(args)`. Named arguments are supported and must come after positional ones: `{{ count | pluralize(plural = "gies") }}`.

Plain filters: `center` (in a field of given width), `lower` / `lowercase`, `upper` / `uppercase`, `title` / `titlecase`, `trim`, `wordcount`, `safe`, `unique` (requires `std`), `ref` / `deref`.

| Filter | Behavior |
|---|---|
| `capitalize` | First char upper, all others lowercased: `hElLO` -> `Hello` |
| `escape` / `e` | Escape with the template's escaper, or a named one: `e("html")` |
| `filesizeformat` | Bytes -> SI decimal units: `1024` -> `1.02 kB`; `filesizeformat(precision = 3)` |
| `fmt(fmtstr)` | Apply Rust format string to the piped value |
| `format(args...)` | Like `format!()`; the piped value is the format string |
| `indent(n)` / `indent(prefix)` | Indent every line but the first; blank lines stay bare. `indent(4, true, true)` indents those too |
| `join(sep)` | Join iterable into string. Prints once; a second print of the same value is empty |
| `linebreaks` | `\n` -> `<br/>`, `\n\n` -> `<p>` |
| `linebreaksbr` | Every `\n` -> `<br/>` |
| `paragraphbreaks` | Only `\n\n` -> `<p>`. These three escape their input (since 0.13): never pipe through `escape` first |
| `pluralize(singular = "", plural = "s")` | Suffix based on ±1 of the piped count |
| `reject(value)` / `reject(callback)` | Filter iterator: `reject(crate::is_odd)`. There is no `reject_with` filter |
| `truncate(n)` | Limit length, appends `...` if truncated |
| `assigned_or(fallback)` | Fallback if the value is in its default state: `None`, `Err`, but also `""`, `0`, `false`. Never where `0` / `""` is a valid value (0.15) |
| `defined_or(fallback)` | Fallback if the identifier is undefined; LHS must be an identifier (0.15) |
| `default(val[, bool])` | Jinja-compat: acts as `defined_or`, or as `assigned_or` when 2nd arg is `true`. Prefer the two above (0.15) |
| `json` / `tojson` | Compact JSON; `json(2)` pretty-prints. Feature `serde_json` (opt-in) |
| `urlencode` | Does NOT encode `/`: for path segments and query parts. Feature `urlencode` (default) |
| `urlencode_strict` | Encodes `/` too: only when the server cannot take `/` in a query string. Same feature |

- `fmt` takes the literal second, `format` first: `{{ value | fmt("{:?}") }}` or `{{ "{:?}" | format(value) }}`, never `{{ value | format("{:?}") }}`.
- `{{ count }} item{{ count | pluralize }}`: pipe the count itself.

## 14. Custom Filters

Since **0.15** a custom filter is a plain fn annotated with **`#[askama::filter_fn]`**; a bare `fn` in `mod filters` no longer compiles. Put it in a module named `filters` in scope of the `#[derive(Template)]` struct, or call it via an explicit path (`{{ x | mymod::myfilter }}`).

**Mandatory signature**: first arg is the piped-in value (any type; `impl Display` or a generic bound is typical, accepting owned and borrowed), second is `&dyn askama::Values` (the runtime-values env, since 0.14). Returns `askama::Result<T>`. In a chain only the *last* filter's `T` must be `Display`.

```rust
use askama::Template;

#[derive(Template)]
#[template(source = "{{ s | shout }}", ext = "txt")]
struct Msg<'a> { s: &'a str }

mod filters {
    #[askama::filter_fn]
    pub fn shout<T: std::fmt::Display>(s: T, _env: &dyn askama::Values) -> askama::Result<String> {
        Ok(s.to_string().to_uppercase() + "!")
    }
}
```

- Required extra args are more params after the two mandatory ones: `fn repeat(s: impl Display, _: &dyn Values, n: usize)` invoked as `{{ s | repeat(4) }}`.
- Optional args (must follow every required one) declare their default with `#[optional(...)]`: `#[optional(None)] a: Option<&str>`, `#[optional("hi")] b: &str`.
- Named-argument invocation works (named must follow positional): `{{ x | f(b = "yo") }}`. Lifetimes (0.15.1) and `where` bounds (0.15.2) on the fn are allowed.
- Built-in filter names take precedence over custom ones; be explicit with `{{ x | filters::myfilter }}` if you shadow one.
- A filter that produces HTML returns `askama::Result<askama::filters::Safe<String>>`, ending `Ok(askama::filters::Safe(html))`, or its output is escaped. The mark holds only for the last filter of a chain; a later filter voids it.
- **Filter fns and `render()` / `render_into()` are synchronous only.** No async support; an `async fn` doesn't satisfy the `#[askama::filter_fn]` signature.

## 15. Debugging Tips

- **Playground**: https://play.askama.rs shows the generated code for a template.
- **Compile errors**: Askama's own errors carry the template's `file:line:column`; type errors in generated code point at `#[derive(Template)]` unless the nightly-only `nightly-spans` feature is on. Lifetime / ownership errors in generated code usually mean a field got moved. Take a reference, or use `&` in the template.
- **Docs**: https://askama.rs (book, canonical syntax reference), https://docs.rs/askama (API, full filter list).

## 16. Checklist

Run over your own diff:

- [ ] `Cargo.toml`: no `askama_axum` / `rinja*`; every gated filter has its feature (`serde_json` for `json`).
- [ ] `path` has no `templates/` prefix; every `source` has an `ext`.
- [ ] Handlers return an HTML response type and propagate `askama::Error`; nothing renders through `.to_string()`.
- [ ] No `&`, `|`, `^` as bitwise operators; free functions are called by path (`self::f()`); `?` only on `Result`.
- [ ] Every `{% match %}` is exhaustive or ends with `{% else %}`.
- [ ] A mutated variable is `let mut` and changed with `{% mut %}`.
- [ ] A child template keeps all markup inside blocks and repeats no block name.
- [ ] No hand pre-escaping; every `| safe` marks trusted markup; `json` placement follows §12.
- [ ] Custom filters have `#[askama::filter_fn]`, `&dyn askama::Values` second, an `askama::Result` return.
