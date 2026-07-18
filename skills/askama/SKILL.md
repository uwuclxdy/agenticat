---
name: askama
description: "Askama Rust templating (0.16): syntax, filters, inheritance, macros, web-framework support via askama_web, rinja migration. Use when writing or debugging Askama templates, or upgrading from older askama or rinja. Not for `maud` (the other Rust HTML crate)."
metadata:
  author: uwuclxdy
  version: "1.3"
---

# Askama (Rust Templating)

> _Captured 2026-07-10 (askama 0.16.0). To update: re-verify against the askama book + docs.rs/askama, then diff for changes._

Askama is a compile-time, Jinja-like template engine for Rust. Templates are parsed at build time and generate type-checked Rust code. This skill targets the **unified askama crate, version 0.16.x** (MSRV 1.88, raised in 0.15.0 from 1.83; was 1.81 through 0.13.x, then 1.83 in 0.14.0). Anything older than 0.13 wired web frameworks through dedicated `askama_*` crates that no longer exist; see the breaking-changes section if migrating.

> Quick history: Askama was forked into `rinja` in 2024, then the two projects re-unified as `askama` in early 2025. If the user mentions `rinja` or `rinja_axum`, those are deprecated. Migrate to `askama` / `askama_web`.

---

## 1. Current State & Setup

### Cargo.toml

```toml
[dependencies]
askama = "0.16"
# For web frameworks, ADD askama_web separately (see §3):
askama_web = { version = "0.16", features = ["axum-0.8"] }
```

Do not depend on `askama_axum`, `askama_actix`, `askama_warp`, or `askama_rocket` (deprecated when 0.13 unified them), nor `askama_gotham` / `askama_tide` (never deprecated; just abandoned since 2023 on askama ^0.12). All dead now. There is no `askama_actix_web` crate.

### Minimal Example

`templates/hello.html`:
```
Hello, {{ name }}!
```

```rust
use askama::Template;

#[derive(Template)]
#[template(path = "hello.html")]
struct HelloTemplate<'a> { name: &'a str }

HelloTemplate { name: "world" }.render()? // -> Result<String, askama::Error>
```

Templates live in `templates/` at the crate root (next to `Cargo.toml`) by default. Override via `askama.toml` (see §11).

---

## 2. Rendering API: Use the Right Method

Prefer these over `.to_string()` or `format!()`, which route through a vtable at runtime and run 100-200% slower:

| Method | Output | When to use |
|---|---|---|
| `tmpl.render()` | `Result<String, askama::Error>` | Default. Allocates a new `String`. |
| `tmpl.render_into(&mut writer)` | writes into `impl fmt::Write` | Reusing a buffer, nested rendering. |
| `tmpl.write_into(&mut writer)` | writes into `impl io::Write` | Writing directly to a socket / file. |

The `Template` trait exposes `render_with_values(&dyn Values)` for runtime-injected values that aren't on the struct.

The derive auto-computes a `SIZE_HINT` const from the template's static text; `render()` / `render_with_values` preallocate their `String` with it (no effect on the caller-owned writers of `render_into` / `write_into`). There is no `size_hint` attribute; `#[template(size_hint = ...)]` is a compile error (`unsupported template attribute`). Override the hint only by hand-implementing `Template` with a custom `const SIZE_HINT`.

**Removed in 0.13+**: `Template::EXTENSION` and `Template::MIME_TYPE` associated fields no longer exist. Do not reference them.

---

## 3. Web Framework Integration

**Two paths. Pick one.**

### Path A: Manual (Simplest, No Extra Crate)

Call `.render()` and wrap the string yourself.

```rust
// axum
use axum::response::{Html, IntoResponse};

async fn index() -> impl IntoResponse {
    Html(IndexTemplate { title: "Home" }.render().unwrap())
}
```

For proper error handling, return `Result<Html<String>, AppError>` where `AppError: IntoResponse` and `AppError::from(askama::Error)` exists.

### Path B: `askama_web` with `WebTemplate`

One derive implements the response trait for whichever feature flag you turned on (see the list below).

```toml
askama_web = { version = "0.16", features = ["axum-0.8"] }
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

**Per-target feature flags for askama_web**:
- `axum-0.8` / `axum-0.7` / `axum-core-0.5` / `axum-core-0.4`
- `actix-web-4`
- `rocket-0.5`
- `warp-0.4` / `warp-0.3`
- `poem-3`
- `trillium-0.2`
- `cot-0.3` / `cot-0.4` / `cot-0.5` / `cot-0.6` / `cot_core-0.6`
- `derive` (WebTemplate derive, on by default) and `eprintln`. Standalone logging-backend flags `log-0.4` / `tracing-0.1` (one of each, shared across all integrations)

---

## 4. `#[template(...)]` Attribute Options

| Key | Example | Purpose |
|---|---|---|
| `path` | `path = "hello.html"` | File in templates dir. Extension drives escaping. |
| `source` | `source = "Hi {{ name }}"` | Inline template; requires `ext`. |
| `ext` | `ext = "html"` | Content-type hint; `"jinja"` / `"jinja2"` aliases for editor syntax highlighting. |
| `escape` | `escape = "none"` or `"html"` | Override auto-escape. |
| `whitespace` | `whitespace = "suppress"` | Per-template WS mode (`"preserve"` / `"suppress"` / `"minimize"`); overrides `askama.toml`. |
| `syntax` | `syntax = "foo"` | Use a custom syntax defined in `askama.toml`. |
| `config` | `config = "config.toml"` | Override config path (default `askama.toml`). |
| `print` | `print = "code"` / `"ast"` / `"all"` / `"none"` | Compile-time debug: prints generated code to stdout. |
| `block` | `block = "hello"` | Render just one block. Fields outside that block aren't required. Good for HTMX fragments. |
| `blocks` | `blocks = ["title", "content"]` | Generates `as_<block>()` accessor methods on the struct, one per block. |
| `in_doc` | `in_doc = true` | Source is in the struct's doc comment (inside an ```askama fenced block). Requires `ext`. |
| `askama` | `askama = $crate::__askama` | Override the `askama` crate path. Needed when re-exporting from a macro-defining crate. |

Cannot combine `path` and `source`.

`path` and `source` must be string literals known at compile time, the same constraint `{% include %}` paths have (§10). The template can't be chosen at runtime from a variable or computed string.

---

## 5. Expressions

### Literals and Types
- Struct construction: `{{ MyStruct { field1: 1, field2: "x" }.to_string() }}`
- Tuple: `{{ (1, 2) }}`, array: `{{ [1, 2, 3] }}`, array-repeat (0.15): `{{ [0; 4] }}`
- Struct expressions are values, not just via `.to_string()` (0.15): `{{ Point { x: 1, y: 2 } }}`

### Variable Access
- `{{ name }}`: field on template struct
- `{{ user.name }}`: dotted path (fields or methods)
- `{{ crate::MAX_USERS }}`: use constants from your crate
- Reading follows Rust borrow rules. Methods can be called; beware self-recursion.

### Operators (Mostly like Rust)
- **Bitwise are RENAMED** (to avoid filter-pipe conflict):
  - `|` -> `bitor`
  - `&` -> `bitand`
  - `^` -> `xor`
  - Precedence unchanged.
  - `{% if my_bitset bitand 1 != 0 %}set!{% endif %}`
- **Concat `~`**: `{{ a ~ b ~ c }}` is shorthand for `{{ a }}{{ b }}{{ c }}`. **Must have spaces around it** to disambiguate from whitespace control.
- **`as` cast**: `{{ x as i64 }}`. Only primitive types. Automatically derefs `&&&bool` etc.

### Function and Method Calls
- `{{ method() }}` -> `self.method()` (method on the template struct)
- `{{ self::function() }}` -> free function in the current module
- `{{ super::b::f() }}` -> function in another module
- `{{ (closure)(12) }}` -> calling a closure stored in a field; parens required
- `{{ some_macro!(field) }}` -> Rust macro. **Askama won't infer field references inside macro args.** Pass them explicitly, or the macro sees the literal token instead.

---

## 6. Control Flow

### if / else if / else
`{% if a %}…{% else if b %}…{% else %}…{% endif %}`

### for
`{% for user in users %}<li>{{ user.name }}</li>{% endfor %}`

- **Filter clause**: `{% for user in users if user.active %}`
- **Else clause** (runs if iter was empty or all filtered out):
  ```
  {% for u in users %}...{% else %}No one here.{% endfor %}
  ```
- **Loop variables** (the complete list; Askama exposes fewer of them than Jinja does):
  - `loop.index` (1-based)
  - `loop.index0` (0-based)
  - `loop.first`
  - `loop.last`
  - `loop.cycle([...])` (method call, array-literal arg): `{{ loop.cycle(["a", "b"]) }}` cycles per iteration
- No `loop.length`, `loop.revindex`, `loop.changed`, `loop.previtem`, `loop.nextitem`. If you need these, compute in Rust or use modulo on `loop.index`.

### match / when (for Enums, Options, Results)
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
- Struct variants: `{% when Variant { field } %}` or `{% when Variant { field: val } %}` to rename (with-less form since 0.11; 0.8 through 0.10 required the `with` keyword: `{% when Variant with { field } %}`)
- Enum path variants: `{% when Self::Circle { radius } %}`. `#[derive(Template)]` works on the enum itself, giving each variant its own `#[template(...)]`.
- Slice patterns with rest: `{% when [first, ..] %}`
- Wildcard: `{% when _ %}` or `{% else %}`
- Literal patterns: `{% when 3 %}`

### Assignments and Variable Declarations
```
{% let name = user.name %}           {# immutable binding #}
{% let mut it = xs.iter() %}         {# mutable binding #}
{% set x = 4 %}                       {# alias for let (Jinja compat) #}
{% decl val %}                        {# declare WITHOUT value; let/set can't since 0.16 #}
{% if cond %}
  {% let val = "a" %}
{% else %}
  {% let val = "b" %}
{% endif %}
{{ val }}
```
- Shadowing is allowed, same as Rust.
- **`decl` (alias `declare`) is the only valueless declaration since 0.16.** Bare `{% let x %}` / `{% set x %}` with no `=` now starts a *let/set block* instead (below).
- **let/set blocks (0.16)**: capture a rendered block into a string variable:
  ```
  {% let heading %}{{ title }} on {{ site }}{% endlet %}
  {{ heading }}
  ```
- **Compound assignment uses the `{% mut %}` tag (0.16)**, not bare `let`: `{% mut counter += i %}`. Every Rust compound operator (`+=`, `-=`, `*=`, …) works; the target must be a `mut` binding.
- **Do not prefix variables with `__askama`, name one `caller` (reserved since 0.15), or use Rust keywords.**

### Filter Blocks
Apply one or more filters to a whole block:
```
{% filter lower | capitalize %}
  {{ t }} / HELLO / {{ u }}
{% endfilter %}
```

---

## 7. Whitespace Control: Three Operators, Not One

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

Global default comes from `askama.toml`'s `whitespace = "preserve" | "suppress" | "minimize"`. Inline operators override globals. When two inline controls point at the same span, **Suppress always wins**; between Minimize and Preserve, whichever operator sits on the tag AFTER the gap wins (positional, not a fixed priority). The book's flat `Suppress > Minimize > Preserve` table is wrong vs 0.16.0 for the Minimize/Preserve case.

Whitespace-control operators (`-`/`+`/`~`) on `{% extends %}` are accepted but a no-op, **not** a compile error. The child's top-level content is dropped anyway, so a trim has nothing to act on. (The book still describes this as "rejected"; that's stale vs 0.16.0.)

---

## 8. Comments

Nested block comments are supported:
```
{# outer {# nested #} still in outer #}
```

---

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

Rules:
- Multi-layer inheritance is supported.
- **Blocks inside `if`/`else`/`for`**: the book forbids this, but 0.16.0 compiles it and inheritance overrides correctly (verified empirically). Top-level or block-nested stays the safe form.
- The extending template's top-level content outside blocks is ignored.
- A base template must define at least one block for inheritance to work.
- Askama looks for the extended template relative to the extending one first, then relative to the config'd template dirs.
- Duplicate `{% block %}` names in the same template are a hard compile error since 0.16, previously only a warning (see §15).

### Single-Block & Per-Block Sub-Templates

`block` / `blocks` (see §4): `block = "content"` renders one block (fields outside it not required, good for HTMX partials); `blocks = ["title", "content"]` generates `as_<block>()` accessor methods on the struct itself, e.g. `page.as_title().render()` / `page.as_content().render()` (no new struct types).

---

## 10. Includes, Macros, and Composition

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
- **Expression-call syntax (0.15)**: invoke a macro like a function, `{{ heading("Title") }}` (named args allowed too). Only works for macros that don't require a `caller` body.
- Macro args can carry type annotations and default-value generics (0.15/0.16).
- Optional named endmacro: `{% endmacro heading %}`
- Named arguments (must come AFTER positional):
  ```
  {% macro h(arg, bold) %}<h1>{{arg}}<b>{{bold}}</b></h1>{% endmacro %}
  {% call h(bold="x", arg="y") %}
  ```

### Importing Macros from Another File
```
{%- import "macros.html" as m -%}
{% call m::heading("hi") %}
```

### Call-Block Syntax (Macros with Inner Content)
```
{% macro card() %}
  <div class="card">{{ caller() }}</div>
{% endmacro %}

{% call card() %}
  <p>Body passed into the macro.</p>
{% endcall %}
```
`caller()` inside the macro renders the block passed to `{% call %}...{% endcall %}`. To pass arguments, the call-block declares them up front: `{% call(user) dump_users(list) %}...{% endcall %}` makes the macro's `caller(user)` render the body once per invocation. Guard an optional body with `{% if caller is defined %}`. `caller` is a reserved variable name since 0.15.

### Render-in-Place (Nested Template Structs)
Embed a Template-derived type as a field; it auto-renders via its `Display` impl:
```rust
#[derive(Template)]
#[template(source = "Section 1: {{ s1 }}", ext = "txt")]
struct Outer { s1: Inner }

#[derive(Template)]
#[template(source = "A={{ a }}", ext = "txt")]
struct Inner { a: String }
```

### Recursive Rendering
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

## 11. Configuration: `askama.toml`

Place at crate root (next to `Cargo.toml`). All sections are optional.

```toml
[general]
dirs = ["templates"]                  # default; globs OK (0.16): ["templates/*"], ["templates/**"]
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
- HTML escaper: `askama`, `html`, `htm`, `j2`, `jinja`, `jinja2`, `rinja`, `svg`, `xml`
- Text (no escape): `md`, `yml`, `none`, `txt` (and the empty extension)

Escape modes override via `#[template(escape = "html")]` or `escape = "none"`.

---

## 12. Auto-Escaping

Askama escapes `<`, `>`, `&`, `"`, `'` per OWASP recommendations when the extension implies HTML.

Per-expression bypass:
- `{{ value | safe }}`: don't escape this value
- `{{ value | escape }}` or `{{ value | e }}`: force escape in an unescaped context

---

## 13. Built-in Filters

All filters use `value | filter_name(args)`. Named arguments are supported: `{{ count | pluralize(plural = "gies") }}`.

### Always Available
| Filter | Purpose |
|---|---|
| `capitalize` | First char upper, rest lower |
| `center` | Center in a field of given width |
| `escape` / `e` | Force HTML escape |
| `filesizeformat` | Bytes -> "1.4 KB" |
| `fmt(fmtstr)` | Apply Rust format string |
| `format(fmtstr, ...)` | Like `format!()` |
| `indent(n)` / `indent(prefix)` | Indent each line |
| `join(sep)` | Join iterable into string |
| `linebreaks` | Plain text -> `<p>`/`<br>` |
| `linebreaksbr` | Newlines -> `<br>` |
| `lower` / `lowercase` | Lowercase |
| `paragraphbreaks` | Only `\n\n` -> `<p>` |
| `pluralize(singular="", plural="s")` | Suffix based on ±1 |
| `reject` / `reject_with` | Filter iterator |
| `safe` | Mark as HTML-safe |
| `title` / `titlecase` | Title Case |
| `trim` | Strip whitespace |
| `truncate(n)` | Truncate with "…" |
| `unique` | Dedup iterator (requires `std`) |
| `upper` / `uppercase` | Uppercase |
| `wordcount` | Count words |
| `assigned_or(fallback)` | Fallback if the value equals its type default (0.15) |
| `defined_or(fallback)` | Fallback if the identifier is undefined; LHS must be an identifier (0.15) |
| `default(val[, bool])` | Jinja-compat: acts as `defined_or`, or as `assigned_or` when 2nd arg is `true`. Prefer the two above (0.15) |

### Feature-Gated
| Filter | Feature flag |
|---|---|
| `json` (indent arg selects pretty: `{{ value | json(2) }}`) | `serde_json` |
| `urlencode` (does NOT encode `/`) | `urlencode` |
| `urlencode_strict` (encodes `/`) | `urlencode` |

Add to `Cargo.toml`: `askama = { version = "0.16", features = ["serde_json", "urlencode"] }`

### Filters Removed Since Older Askama
- `humansize`: always available now, no flag needed
- `markdown`: removed, use `comrak` directly
- `serde-yaml`: removed, use `yaml-rust2` directly
- `serde-json` renamed to `serde_json`

---

## 14. Custom Filters

Since **0.15** a custom filter is a plain fn annotated with **`#[askama::filter_fn]`**. Put it in a module named `filters` in scope of the `#[derive(Template)]` struct, or call it via an explicit path (`{{ x | mymod::myfilter }}`).

**Mandatory signature**: first arg is the piped-in value (any type; `impl Display` or a generic bound is typical, accepting owned and borrowed), second is `&dyn askama::Values` (askama's runtime-values env). Returns `askama::Result<T>`. In a chain only the *last* filter's `T` must be `Display`; earlier ones may return any `T`.

```rust
use askama::Template;

#[derive(Template)]
#[template(source = "{{ s | shout }}", ext = "txt")]
struct Msg<'a> { s: &'a str }

mod filters {
    #[askama::filter_fn]
    pub fn shout<T: std::fmt::Display>(
        s: T,
        _env: &dyn askama::Values,
    ) -> askama::Result<String> {
        Ok(s.to_string().to_uppercase() + "!")
    }
}
```

**Extra arguments** come after the two mandatory ones:
- Required args are just more params: `fn repeat(s: impl Display, _: &dyn Values, n: usize)` invoked as `{{ s | repeat(4) }}`.
- Optional args (must follow every required one) declare their default with the `#[optional(...)]` attribute:
  ```rust
  #[askama::filter_fn]
  pub fn f(
      value: impl Display,
      _env: &dyn askama::Values,
      #[optional(None)] a: Option<&str>,   // omitted -> None
      #[optional("hi")] b: &str,           // omitted -> "hi"
  ) -> askama::Result<String> { /* ... */ }
  ```
- Named-argument invocation works (named must follow positional): `{{ x | f(b = "yo") }}`. Lifetimes on the fn are allowed since 0.15.1, `where` bounds since 0.15.2.

Notes:
- Built-in filter names take precedence over custom ones; be explicit with `{{ x | filters::myfilter }}` if you shadow one.
- **Migrating from ≤0.14**: the old bare-fn form (no attribute) no longer compiles. Add `#[askama::filter_fn]`; it's what unlocked the named/optional args the old form couldn't express.
- **Filter fns and `render()` / `render_into()` are synchronous only.** No async support; an `async fn` doesn't satisfy the `#[askama::filter_fn]` signature.

---

## 15. Gotchas and Footguns

1. **`askama_axum` / `askama_actix` / etc. are gone** — use `#[derive(WebTemplate)]` (askama_web) or manual `.render()` + `Html(...)`.
2. **`|`, `&`, `^` are not bitwise in templates** — use `bitor`, `bitand`, `xor`.
3. **Self-include doesn't work** — recurse via an embedded child struct (Display) or explicit `{{ child.render()? }}`.
4. **Blocks inside `if`/`for`**: book forbids it, 0.16.0 compiles it (§9); top-level/block-nested is safe.
5. **Whitespace control on `{% extends %}` is a silent no-op**, not a compile error (§7).
6. **Variable names starting with `__askama`, the reserved `caller`, or Rust keywords are banned.**
7. **A method returning `self`** infinite-loops via Display; don't write `{{ self }}`.
8. **Rust macro calls don't infer field names** (§5): `{{ my_macro!(field) }}` sees `field`, not `self.field`.
9. **Prefer `.render()` / `.render_into()` over `.to_string()`** (2-3x slower).
10. **`~` is concat (with spaces) vs. whitespace-minimize (no spaces)** — keep spaces around concat.
11. **Auto-escape depends on extension** (`.html` escaped, `.txt` not); inline `source` needs explicit `ext` / `escape`.
12. **Rinja is dead** — `rinja` / `rinja_axum` / `rinja_derive` -> `askama` / `askama_web` (see intro).
13. **Custom filters need `#[askama::filter_fn]`** since 0.15; a bare `fn` in `mod filters` no longer compiles (§14).
14. **0.16 upgrade breakage**: valueless `{% let x %}` / `{% set x %}` now opens a *block* (use `{% decl x %}`); compound assignment moved to `{% mut %}`; duplicate block names are now a hard compile error (was a warning).
15. **`path` / `source` take string literals only** (§4), same as `{% include %}` (§10). No picking the template from a variable or computed string at runtime.
16. **Filter fns and `render()` / `render_into()` are sync only** (§14). No async filter or async render path exists.

---

## 16. Debugging Tips

- **Playground**: https://askama.rs has a web playground that shows the generated code for any template.
- **Compile errors**: Askama's error messages point at the template's `file:line:column` location. Lifetime / ownership errors in generated code usually mean a field got moved. Take a reference, or use `&` in the template.
- **Book**: https://askama.rs for the canonical syntax reference.
- **docs.rs**: https://docs.rs/askama for API docs and the full filter list.

---

## 17. Quick Reference Card

```
Expressions:   {{ expr }}               Tags:   {% stmt %}       Comments: {# ... #}
WS control:    {%- strip    -%}  {%~ min ~%}  {%+ keep +%}
Inheritance:   {% extends "base.html" %}  {% block x %}...{% endblock %}  {{ super() }}
Loops:         {% for x in xs if cond %}...{% else %}...{% endfor %}     loop.{index,index0,first,last,cycle([…])}
Conditionals:  {% if %}...{% else if %}...{% else %}...{% endif %}
Match:         {% match v %}{% when Some with (x) %}...{% when None %}...{% endmatch %}
Vars:          {% let x = y %}  {% let mut it = … %}  {% set x = 1 %}  {% decl x %}  {% mut x += 1 %}
Let block:     {% let s %}…rendered…{% endlet %}   (captures block output into `s`)
Macros:        {% macro m(a) %}...{% endmacro %}   {% call m(a) %}   expr-call: {{ m(a) }}
               {% call(x) m(a) %}body{% endcall %}    inside macro: {{ caller() }} / {{ caller(x) }}
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
