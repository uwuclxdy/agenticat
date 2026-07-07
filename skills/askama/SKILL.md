---
name: askama
description: "Conventions and reference for the askama Rust templating crate."
---

# Askama (Rust templating)

Askama is a compile-time, Jinja-like template engine for Rust. Templates are parsed at build time and generate type-checked Rust code. This skill targets the **unified askama crate, version 0.15.x** (MSRV 1.81). Anything older than 0.13 had a different integration story — see the breaking-changes section if migrating.

> Quick history Claude should know: Askama was forked into `rinja` in 2024, then the two projects re-unified as `askama` in early 2025. If the user mentions `rinja` or `rinja_axum`, those are deprecated — migrate to `askama` / `askama_web`.

---

## 1. Current state & setup

### Cargo.toml

```toml
[dependencies]
askama = "0.15"
# For web frameworks, ADD askama_web separately (see §3):
askama_web = { version = "0.14", features = ["axum-0.8"] }
```

Do **not** depend on `askama_axum`, `askama_actix_web`, `askama_warp`, `askama_rocket`, `askama_gotham`, or `askama_tide`. They were removed in 0.13 and are dead crates.

### Minimal example

`templates/hello.html`:
```
Hello, {{ name }}!
```

`src/main.rs`:
```rust
use askama::Template;

#[derive(Template)]
#[template(path = "hello.html")]
struct HelloTemplate<'a> {
    name: &'a str,
}

fn main() {
    let hello = HelloTemplate { name: "world" };
    println!("{}", hello.render().unwrap());
}
```

Templates live in `templates/` at the crate root (next to `Cargo.toml`) by default. Override via `askama.toml` (see §11).

---

## 2. Rendering API — use the right method

Prefer these over `.to_string()` or `format!()` (100–200% slower due to dynamic dispatch):

| Method | Output | When to use |
|---|---|---|
| `tmpl.render()` | `Result<String, askama::Error>` | Default. Allocates a new `String`. |
| `tmpl.render_into(&mut writer)` | writes into `impl fmt::Write` | Reusing a buffer, nested rendering. |
| `tmpl.write_into(&mut writer)` | writes into `impl io::Write` | Writing directly to a socket / file. |

The `Template` trait also exposes `render_with_values(&dyn Values)` for runtime-injected values that aren't on the struct.

Optional: `#[template(size_hint = 4096)]` preallocates the output buffer for `.render()`. No effect on the other methods.

**Removed in 0.13+**: `Template::EXTENSION` and `Template::MIME_TYPE` associated fields no longer exist. Do not reference them.

---

## 3. Web framework integration

**Two paths. Pick one.**

### Path A — manual (simplest, no extra crate)

Call `.render()` and wrap the string yourself.

```rust
// axum
use axum::response::{Html, IntoResponse};

async fn index() -> impl IntoResponse {
    let tmpl = IndexTemplate { title: "Home" };
    Html(tmpl.render().unwrap())
}
```

For proper error handling, return `Result<Html<String>, AppError>` where `AppError: IntoResponse` and `AppError::from(askama::Error)` exists.

### Path B — `askama_web` with `WebTemplate`

One derive implements the framework's response trait automatically.

```toml
askama_web = { version = "0.14", features = ["axum-0.8"] }
```

```rust
use askama::Template;
use askama_web::WebTemplate;

#[derive(Template, WebTemplate)]
#[template(path = "hello.html")]
struct HelloTemplate { name: String }

async fn hello() -> HelloTemplate {
    HelloTemplate { name: "world".into() }
}
```

Returns `200 OK`, `Content-Type: text/html; charset=utf-8`. Render errors become `500`.

**Framework feature flags for askama_web**:
- `axum-0.8` / `axum-0.7` / `axum-core-0.5` / `axum-core-0.4`
- `actix-web-4`
- `rocket-0.5`
- `warp-0.4` / `warp-0.3`
- `poem-3`
- `trillium-0.2`
- `cot-0.5` / `cot-0.6` / `cot_core-0.6`
- Logging helpers: `eprintln`, plus framework-specific logging features

---

## 4. `#[template(...)]` attribute options

| Key | Example | Purpose |
|---|---|---|
| `path` | `path = "hello.html"` | File in templates dir. Extension drives escaping. |
| `source` | `source = "Hi {{ name }}"` | Inline template; requires `ext`. |
| `ext` | `ext = "html"` | Content-type hint; also `"jinja"` / `"jinja2"` aliases for editor syntax highlighting. |
| `escape` | `escape = "none"` or `"html"` | Override auto-escape. |
| `syntax` | `syntax = "foo"` | Use a custom syntax defined in `askama.toml`. |
| `config` | `config = "config.toml"` | Override config path (default `askama.toml`). |
| `print` | `print = "code"` / `"ast"` / `"all"` / `"none"` | Compile-time debug: prints generated code to stdout. |
| `block` | `block = "hello"` | Render just one block. Fields outside that block aren't required. Good for HTMX fragments. |
| `blocks` | `blocks = ["title", "content"]` | Auto-generates sub-template structs, one per block. |
| `in_doc` | `in_doc = true` | Source is in the struct's doc comment (inside an ```askama fenced block). Requires `ext`. |
| `askama` | `askama = $crate::__askama` | Override the `askama` crate path. Needed when re-exporting from a macro-defining crate. |

Cannot combine `path` and `source`.

---

## 5. Expressions

### Literals and types
- String: `"foo"`, integer: `1`, boolean: `true`/`false`
- Struct construction: `{{ MyStruct { field1: 1, field2: "x" }.to_string() }}`
- Tuple: `{{ (1, 2) }}`, array: `{{ [1, 2, 3] }}`

### Variable access
- `{{ name }}` — field on template struct
- `{{ user.name }}` — dotted path (fields or methods)
- `{{ crate::MAX_USERS }}` — use constants from your crate
- Reading follows Rust borrow rules. Methods can be called; beware self-recursion.

### Operators (mostly like Rust)
- Arithmetic: `+ - * / %`
- Comparison: `== != < > <= >=`
- Logic: `&& || !`
- **Bitwise are RENAMED** (to avoid filter-pipe conflict):
  - `|` → `bitor`
  - `&` → `bitand`
  - `^` → `xor`
  - Precedence unchanged.
  - `{% if my_bitset bitand 1 != 0 %}set!{% endif %}`
- **Concat `~`**: `{{ a ~ b ~ c }}` is shorthand for `{{ a }}{{ b }}{{ c }}`. **Must have spaces around it** to disambiguate from whitespace control.
- **`as` cast**: `{{ x as i64 }}`. Only primitive types. Automatically derefs `&&&bool` etc.

### Function and method calls
- `{{ method() }}` → `self.method()` (method on the template struct)
- `{{ self::function() }}` → free function in the current module
- `{{ super::b::f() }}` → function in another module
- `{{ (closure)(12) }}` → calling a closure stored in a field — parens required
- `{{ some_macro!(field) }}` → Rust macro; **Askama won't infer field references inside macro args** — you must pass them explicitly somehow or the macro will see the literal token.

---

## 6. Control flow

### if / else if / else
```
{% if users.len() == 0 %}
  No users
{% else if users.len() == 1 %}
  1 user
{% else %}
  {{ users.len() }} users
{% endif %}
```

### for
```
{% for user in users %}
  <li>{{ user.name }}</li>
{% endfor %}
```

- **Filter clause**: `{% for user in users if user.active %}`
- **Else clause** (runs if iter was empty or all filtered out):
  ```
  {% for u in users %}...{% else %}No one here.{% endfor %}
  ```
- **Loop variables** (only these — Askama does NOT implement Jinja's full set):
  - `loop.index` (1-based)
  - `loop.index0` (0-based)
  - `loop.first`
  - `loop.last`
- No `loop.length`, `loop.cycle`, `loop.revindex`, `loop.changed`, `loop.previtem`, `loop.nextitem`. If you need these, compute in Rust or use modulo on `loop.index`.

### match / when (for enums, Options, Results)
```
{% match item %}
  {% when Some with ("foo") %}
    Found literal foo
  {% when Some with (val) %}
    Found {{ val }}
  {% when None %}
    Nothing
{% endmatch %}
```
- Tuple variants: `{% when Variant with (a, b) %}`
- Struct variants (since 0.8): `{% when Variant { field } %}` or `{% when Variant { field: val } %}` to rename
- Wildcard: `{% when _ %}` or `{% else %}`
- Literal patterns: `{% when 3 %}`

### Assignments and variable declarations
```
{% let name = user.name %}           {# immutable binding #}
{% let mut it = xs.iter() %}         {# mutable binding #}
{% set x = 4 %}                       {# alias for let (Jinja compat) #}
{% decl val %}                        {# declare without value #}
{% if cond %}
  {% let val = "a" %}
{% else %}
  {% let val = "b" %}
{% endif %}
{{ val }}
```
- Shadowing is allowed, same as Rust.
- Compound assignment operators (`+=`, `-=`, etc.) that work in Rust work here.
- **Do not prefix variables with `__askama` or use Rust keywords.**

### Filter blocks
Apply one or more filters to a whole block:
```
{% filter lower | capitalize %}
  {{ t }} / HELLO / {{ u }}
{% endfilter %}
```

---

## 7. Whitespace control — three operators, not one

| Operator | Name | Effect |
|---|---|---|
| `-` | suppress | Remove all whitespace on that side |
| `~` | minimize | Collapse to a single space/newline |
| `+` | preserve | Keep whitespace as-is (overrides config) |

Usage: put right after `{%`/`{{` or right before `%}`/`}}`.
```
<div>
{%- if x %}             {# strip before this tag #}
  <p>{{ x }}</p>
{%- endif %}
</div>

{% for x in xs ~%}      {# minimize trailing whitespace #}
  {{ x }}
{%~ endfor %}
```

Global default comes from `askama.toml`'s `whitespace = "preserve" | "suppress" | "minimize"`. Inline operators override globals. When two inline controls point at the same span, precedence is: **Suppress > Minimize > Preserve**.

`{% extends %}` does NOT accept whitespace control — using `-`/`+` on it is a compile error.

---

## 8. Comments

```
{# a comment #}
{# outer {# nested #} still in outer #}
```
Nested block comments are supported.

---

## 9. Inheritance (extends / block / super)

`base.html`:
```
<!DOCTYPE html>
<html>
  <head><title>{% block title %}{{ title }} · Site{% endblock %}</title></head>
  <body>
    <main>{% block content %}<p>default</p>{% endblock %}</main>
  </body>
</html>
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

Rules:
- Multi-layer inheritance is supported.
- **Blocks must be at the top level of the template or nested inside other blocks.** Not inside `if`, `else`, or `for`.
- The extending template's top-level content outside blocks is ignored.
- A base template must define at least one block to enable inheritance.
- Askama looks for the extended template relative to the extending one first, then relative to the config'd template dirs.

### Rendering a single block
```rust
#[derive(Template)]
#[template(path = "page.html", block = "content")]
struct ContentOnly { ... }
```
Useful for HTMX partials. Fields outside the chosen block aren't required on the struct.

### Auto-generated per-block sub-templates
```rust
#[derive(Template)]
#[template(path = "page.html", blocks = ["title", "content"])]
struct Page { ... }
```
Generates `Page`, `PageTitleBlock`, `PageContentBlock` structs automatically.

---

## 10. Includes, macros, and composition

### `{% include %}`
```
{% for item in items %}
  {% include "item.html" %}
{% endfor %}
```
- Path must be a string literal (known at compile time).
- The included template has full access to the caller's scope, including loop locals.
- Lookup: relative to including template first, then template dirs.

### Macros
Define with `{% macro name(args) %}...{% endmacro %}`, call with `{% call name(args) %}`:
```
{% macro heading(arg) %}
  <h1>{{ arg }}</h1>
{% endmacro %}

{% call heading("Title") %}
```
- Optional named endmacro: `{% endmacro heading %}`
- Named arguments (must come AFTER positional):
  ```
  {% macro h(arg, bold) %}<h1>{{arg}}<b>{{bold}}</b></h1>{% endmacro %}
  {% call h(bold="x", arg="y") %}
  ```

### Importing macros from another file
```
{%- import "macros.html" as m -%}
{% call m::heading("hi") %}
```

### Call-block syntax (macros with inner content)
```
{% macro card() %}
  <div class="card">{{ caller() }}</div>
{% endmacro %}

{% call card() %}
  <p>Body passed into the macro.</p>
{% endcall %}
```
`caller()` inside the macro renders the block passed to `{% call %}...{% endcall %}`. It can take arguments too (macro invokes `caller(user)`, call block declares parameters).

### Render-in-place (nested Template structs)
Embed a Template-derived type as a field; it auto-renders via its `Display` impl:
```rust
#[derive(Template)]
#[template(source = "Section 1: {{ s1 }}", ext = "txt")]
struct Outer { s1: Inner }

#[derive(Template)]
#[template(source = "A={{ a }}", ext = "txt")]
struct Inner { a: String }
```

### Recursive rendering
Self-include does NOT work. Do recursion with an explicit `.render()` call:
```rust
#[derive(Template)]
#[template(source = r#"
{{ name }} {
  {% for child in children %}
    {{ child.render()? }}
  {% endfor %}
}
"#, ext = "txt", escape = "none")]
struct Item<'a> {
    name: &'a str,
    children: &'a [Item<'a>],
}
```
(Prefer a custom iterator + plain loop when possible.)

---

## 11. Configuration — `askama.toml`

Place at crate root (next to `Cargo.toml`). All sections are optional.

```toml
[general]
dirs = ["templates"]                  # default
whitespace = "preserve"               # or "suppress" | "minimize"

# Custom delimiters (e.g. to avoid collisions with LaTeX or Vue)
[[syntax]]
name = "vue"
block_start = "[%"
block_end = "%]"
expr_start = "[["
expr_end = "]]"
comment_start = "[#"
comment_end = "#]"

# Custom escaper: apply askama::filters::Text (no escaping) to .js files
[[escaper]]
path = "askama::filters::Text"
extensions = ["js"]
```

Use a custom syntax per-template with `#[template(path = "...", syntax = "vue")]`.

**Default escaping extensions**:
- HTML escaper: `html`, `htm`, `xml`, `j2`, `jinja`, `jinja2`
- Text (no escape): `md`, `yml`, `none`, `txt`, `` `` (empty)

Escape modes override via `#[template(escape = "html")]` or `escape = "none"`.

---

## 12. Auto-escaping

Askama escapes `<`, `>`, `&`, `"`, `'` per OWASP recommendations when the extension implies HTML.

Per-expression bypass:
- `{{ value | safe }}` — don't escape this value
- `{{ value | escape }}` or `{{ value | e }}` — force escape in an unescaped context

---

## 13. Built-in filters

All filters use `value | filter_name(args)`. Named arguments are supported: `{{ count | pluralize(plural = "gies") }}`.

### Always available
| Filter | Purpose |
|---|---|
| `capitalize` | First char upper, rest lower |
| `center` | Center in a field of given width |
| `escape` / `e` | Force HTML escape |
| `filesizeformat` | Bytes → "1.4 KB" |
| `fmt(fmtstr)` | Apply Rust format string |
| `format(fmtstr, ...)` | Like `format!()` |
| `indent(n)` / `indent(prefix)` | Indent each line |
| `join(sep)` | Join iterable into string |
| `linebreaks` | Plain text → `<p>`/`<br>` |
| `linebreaksbr` | Newlines → `<br>` |
| `lower` / `lowercase` | Lowercase |
| `paragraphbreaks` | Only `\n\n` → `<p>` |
| `pluralize(singular="", plural="s")` | Suffix based on ±1 |
| `reject` / `reject_with` | Filter iterator |
| `safe` | Mark as HTML-safe |
| `title` / `titlecase` | Title Case |
| `trim` | Strip whitespace |
| `truncate(n)` | Truncate with "…" |
| `unique` | Dedup iterator (requires `std`) |
| `upper` / `uppercase` | Uppercase |
| `wordcount` | Count words |
| `assigned_or(fallback)` | Render fallback if value is default |

### Feature-gated
| Filter | Feature flag |
|---|---|
| `json` | `serde_json` |
| `json_pretty` | `serde_json` |
| `urlencode` (does NOT encode `/`) | `urlencode` |
| `urlencode_strict` (encodes `/`) | `urlencode` |

Enable in `Cargo.toml`: `askama = { version = "0.15", features = ["serde_json", "urlencode"] }`

### Filters REMOVED since older Askama
- `humansize` — now always available (no flag needed)
- `markdown` — removed; use `comrak` directly
- `serde-yaml` — removed; use `yaml-rust2` directly
- `serde-json` was renamed to `serde_json` (underscore)

### Filter chaining
```
{{ name | trim | lower }}
{{ "{:?}" | format(name | escape) }}
```

---

## 14. Custom filters

Define a module named `filters` in scope of the `#[derive(Template)]` struct, OR call your filter via a path (`{{ x | mymod::myfilter }}`).

**Signature (0.13+)**: filter fn takes the value as first arg, `&dyn askama::Values` as second, any extra arguments after, returns `askama::Result<T>` where the final result implements `Display`.

```rust
use askama::Template;

#[derive(Template)]
#[template(source = "{{ s | shout }}", ext = "txt")]
struct Msg<'a> { s: &'a str }

mod filters {
    pub fn shout<T: std::fmt::Display>(
        s: T,
        _: &dyn askama::Values,
    ) -> askama::Result<String> {
        Ok(s.to_string().to_uppercase() + "!")
    }
}
```

Notes:
- Built-in filter names take precedence over custom ones — use `{{ x | myfilter }}` or `{{ x | filters::myfilter }}` to be explicit.
- Custom filters cannot declare named or optional arguments.
- Use a generic bound like `T: Display` to accept both owned and borrowed values.

---

## 15. Gotchas and footguns

1. **Do not reach for `askama_axum` / `askama_actix_web` / etc.** They're gone. Use `askama_web` with `#[derive(WebTemplate)]` OR manual `.render()` + `Html(...)`.
2. **`|`, `&`, `^` are NOT Rust bitwise operators in templates** — use `bitor`, `bitand`, `xor`.
3. **Self-include doesn't work.** For recursion, embed the child struct and either use Display (render-in-place) or explicit `{{ child.render()? }}`.
4. **Blocks can't be inside `if`/`for`.** Top-level or nested in another block only.
5. **`{% extends %}` rejects whitespace control.**
6. **Variable names starting with `__askama` or that are Rust keywords are banned.**
7. **Methods whose result is `self`** cause infinite recursion via the Display impl. Don't write `{{ self }}` or a method that returns self.
8. **Rust macro calls in templates don't infer field names.** `{{ my_macro!(field) }}` will fail because the macro receives the token literally, not `self.field`. Assign to a let first if you need it: `{% let x = field %}{{ my_macro!(x) }}` — but even this has caveats; generally, prefer a method on the struct instead.
9. **Prefer `.render()` / `.render_into()` over `.to_string()`** — 2–3x slower with `to_string`.
10. **`~` has two meanings**: concat operator (with spaces) vs. whitespace "minimize" (no spaces, attached to delimiter). Keep spaces around concat.
11. **Auto-escape depends on extension.** `.html` → escaped, `.txt` → not. Use inline `source = "..."` requires explicit `ext = "..."` or `escape = "..."`.
12. **Rinja is dead.** If user has `rinja` / `rinja_axum` / `rinja_derive` in `Cargo.toml`, migrate: rename to `askama` / `askama_web`, bump MSRV to 1.81, rename bitwise operators, drop any `EXTENSION`/`MIME_TYPE` references, migrate removed features (`humansize` drop, `markdown`→comrak, `serde-yaml`→yaml-rust2, `serde-json`→`serde_json`).

---

## 16. Debugging tips

- **See generated Rust code**: `#[template(path = "x.html", print = "code")]` or `print = "ast"` or `print = "all"` — output goes to stdout at compile time.
- **Playground**: https://askama.rs has a web playground that shows the generated code for any template.
- **Compile errors**: Askama's error messages include the template filename, line, and column. Lifetime / ownership errors in generated code usually mean a field is moved — take references or use `&` in the template.
- **Book**: https://askama.rs for the canonical syntax reference.
- **docs.rs**: https://docs.rs/askama for API docs and the full filter list.

---

## 17. Quick reference card

```
Expressions:   {{ expr }}               Tags:   {% stmt %}       Comments: {# ... #}
WS control:    {%- strip    -%}  {%~ min ~%}  {%+ keep +%}
Inheritance:   {% extends "base.html" %}  {% block x %}...{% endblock %}  {{ super() }}
Loops:         {% for x in xs if cond %}...{% else %}...{% endfor %}     loop.{index,index0,first,last}
Conditionals:  {% if %}...{% else if %}...{% else %}...{% endif %}
Match:         {% match v %}{% when Some with (x) %}...{% when None %}...{% endmatch %}
Vars:          {% let x = y %}  {% let mut it = … %}  {% set x = 1 %}  {% decl x %}
Macros:        {% macro m(a) %}...{% endmacro %}   {% call m(a) %}
               {% call m() %}body{% endcall %}    inside macro: {{ caller() }}
Imports:       {% import "m.html" as ns %}   {% call ns::m(a) %}
Include:       {% include "part.html" %}
Filters:       {{ x | lower | trim }}   block: {% filter lower %}...{% endfilter %}
Concat:        {{ a ~ b ~ c }}          (spaces required)
Cast:          {{ x as i64 }}           (primitives only)
Bitwise:       a bitor b, a bitand b, a xor b   (NOT |, &, ^)
Crate consts:  {{ crate::MY_CONST }}
Struct ctor:   {{ Foo { a: 1 }.to_string() }}
Escape:        {{ x | safe }}   {{ x | e }}   or #[template(escape = "none"|"html")]
```
