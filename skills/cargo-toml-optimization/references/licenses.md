# Rust Cargo.toml: License Fields Reference
> _Captured 2026-07-10 (Rust/Cargo stable). To update: re-fetch the source URL(s) below, then diff for changes._

## Source (for Future Changes)

- https://doc.rust-lang.org/cargo/reference/manifest.html (Cargo manifest spec: license / license-file fields, SPDX 2.3 requirement)
- https://spdx.org/licenses/ (canonical SPDX license list, v3.28.0 at time of writing)
- https://spdx.github.io/spdx-spec/v2.3/SPDX-license-expressions/ (SPDX 2.3 expression grammar spec)
- https://rust-lang.github.io/api-guidelines/necessities.html (Rust API guidelines, licensing section)

---

## SPDX Expression Syntax

Cargo requires the `license` field to be a valid **SPDX 2.3 license expression**. The grammar covers:

### Atoms

| Form | Meaning | Example |
|------|---------|---------|
| `<id>` | Single SPDX identifier | `MIT` |
| `<id>+` | This version or any later version | `GPL-2.0-or-later` is preferred; `+` is the raw SPDX suffix |
| `LicenseRef-<string>` | Custom / non-SPDX license reference | `LicenseRef-MyLicense` |

> Note: no whitespace between the identifier and `+`.

### Operators

| Operator | Meaning | Notes |
|----------|---------|-------|
| `OR` | User may choose either license | commutative; lowest precedence |
| `AND` | User must comply with both simultaneously | commutative; higher precedence than `OR` |
| `WITH` | Adds a named exception to a license | applies to the immediately preceding simple expression |

Operator precedence (highest binds tightest): `+` > `WITH` > `AND` > `OR`

Parentheses override precedence: `MIT AND (LGPL-2.1-or-later OR BSD-3-Clause)`

### Case Rules

- Operators (`AND`, `OR`, `WITH`) are matched **case-insensitively** by crates.io's validator; `MIT or Apache-2.0` parses fine (this reverses the SPDX spec, which specifies case-sensitive operators).
- License identifiers must be typed in **exact canonical case** (`MIT`, `Apache-2.0`, `BSD-2-Clause`). crates.io does not normalize casing; any deviation (`mit`, `apache-2.0`) is rejected outright with an `unknown term` parse error.

### Concrete Examples

```toml
license = "MIT"
license = "MIT OR Apache-2.0"
license = "MIT OR Apache-2.0 WITH LLVM-exception"
license = "LGPL-2.1-only AND MIT AND BSD-2-Clause"
license = "GPL-2.0-or-later WITH Bison-exception-2.2"
license = "MIT AND (LGPL-2.1-or-later OR BSD-3-Clause)"
license = "LicenseRef-Proprietary"
```

---

## Common Identifiers in Rust

Identifiers as they appear on crates.io (SPDX list v3.28.0).

| SPDX id | Category | Notes |
|---------|----------|-------|
| `MIT` | permissive | Most common single license; no patent grant; GPLv2-compatible |
| `Apache-2.0` | permissive | Explicit patent grant; GPLv2-incompatible on its own |
| `Apache-2.0 WITH LLVM-exception` | permissive | Adds GPLv2 compat + compiler-output exception; used by Rust stdlib |
| `BSD-2-Clause` | permissive | Simplified BSD; no advertising clause |
| `BSD-3-Clause` | permissive | Adds non-endorsement clause over 2-Clause |
| `ISC` | permissive | MIT-equivalent terms; shorter text |
| `0BSD` | permissive | Zero-clause BSD; no attribution required |
| `Zlib` | permissive | zlib/libpng license; attribution in docs only |
| `MIT-0` | permissive | MIT with attribution clause removed; no attribution, no copyleft |
| `BSL-1.0` | permissive | Boost Software License; used by Boost-derived C++ ports |
| `Unlicense` | public domain | Explicit public domain dedication with fallback permissive grant |
| `CC0-1.0` | public domain | CC public domain dedication; broad jurisdiction coverage |
| `MPL-2.0` | weak copyleft | File-level copyleft; compatible with GPL-2.0+; used for library-level sharing |
| `LGPL-2.1-only` | weak copyleft | Linking does not trigger copyleft in dependents; v2.1 only |
| `LGPL-2.1-or-later` | weak copyleft | Allows upgrade to future LGPL versions |
| `LGPL-3.0-only` | weak copyleft | LGPL v3 only; not GPL-2.0-compatible |
| `LGPL-3.0-or-later` | weak copyleft | LGPL v3 or any later version |
| `GPL-2.0-only` | copyleft | Strong copyleft; v2 only; common in Linux kernel components |
| `GPL-2.0-or-later` | copyleft | GPL v2 or later; most permissive GPL variant |
| `GPL-3.0-only` | copyleft | GPL v3 only; anti-Tivoization clauses |
| `GPL-3.0-or-later` | copyleft | GPL v3 or any later version |
| `AGPL-3.0-only` | copyleft | Network use triggers copyleft (SaaS-closing) |
| `AGPL-3.0-or-later` | copyleft | AGPL v3 or any later version |

> `LGPL-2.1` (without `-only` / `-or-later`) is deprecated on the SPDX list. crates.io accepts it but the canonical split forms are preferred.

---

## The Rust Convention

### Why `MIT OR Apache-2.0`

Apache-2.0 adds an explicit patent grant MIT lacks but breaks GPLv2 compatibility on its own; pairing it
with MIT under `OR` restores that compatibility while keeping the patent grant. Each user then picks
either license. It is the de-facto crates.io default; the
[Rust API guidelines](https://rust-lang.github.io/api-guidelines/necessities.html) recommend it for
maximum compatibility.

### `Apache-2.0 WITH LLVM-exception` Variant

Used by the Rust standard library (`rustc`, `std`). The LLVM exception does two things:

- Restores GPLv2 compatibility (the gap Apache-2.0 has that MIT fills in the dual-license approach).
- Adds an exception permitting compiler-generated output to be distributed under any license.

Suitable for compiler infrastructure crates; unnecessary for most application or library crates.

### How to Dual-License a Crate

```toml
[package]
license = "MIT OR Apache-2.0"
```

Standard practice: ship both license texts in the repo root.

```
LICENSE-MIT
LICENSE-APACHE
```

The `include` key in `[package]` should list both (or rely on the default glob that includes `LICENSE*`). crates.io will bundle whichever files match.

---

## `license` vs `license-file`

| | `license` | `license-file` |
|---|-----------|----------------|
| Value type | SPDX expression string | relative path to a file |
| crates.io requirement | one of these two must be present | same |
| SPDX validation | yes; crates.io rejects non-SPDX strings | no; SPDX check is skipped entirely |
| Use case | any OSI / SPDX-listed license | proprietary, custom, or non-SPDX licenses |
| Path base | n/a | relative to the `Cargo.toml` (package root) |
| Behaviour | metadata only; you still ship the text | the named file is automatically included in the published crate |

> Setting both is technically allowed, but Cargo warns `only one of license or license-file is necessary`. crates.io keys its displayed licensing off the `license` SPDX field (a crate with only `license-file` shows as "non-standard"), so `license` is the authoritative one when both are set, not `license-file`. Pick one; prefer `license`.

```toml
# Standard open-source crate
license = "MIT OR Apache-2.0"

# Proprietary or unusual license
license-file = "LICENSE.txt"
```

---

## Gotchas

| Issue | Details |
|-------|---------|
| **Legacy `/` separator** | `MIT / Apache-2.0` is the old Cargo convention. crates.io still accepts `/` as an alias for `OR` (`allow_slash_as_or_operator` in its validator, with a passing unit test for `MIT/Apache-2.0`); it is legacy/discouraged, not rejected. Prefer `OR` for clarity: `MIT OR Apache-2.0`. |
| **Non-SPDX strings rejected** | Strings like `"MIT & Apache-2.0"` (`&` is not an SPDX operator) or any free-form text are rejected by crates.io when the `license` field is used (`/` is the exception, accepted as an `OR` alias). Use `license-file` for non-standard licenses instead. |
| **`LicenseRef-` for custom licenses** | SPDX allows `LicenseRef-<alphanumeric-and-hyphens>` for licenses not on the list. crates.io accepts this in the `license` field but provides no link or text; combine with `license-file` for the actual text. Example: `LicenseRef-Proprietary`. |
| **`-only` vs `-or-later` vs bare** | `LGPL-2.1`, `GPL-2.0`, etc. (without suffix) are deprecated SPDX identifiers. Prefer `LGPL-2.1-only` or `LGPL-2.1-or-later` explicitly. The bare forms still parse but trigger deprecation warnings in some tooling. |
| **`+` suffix vs `-or-later`** | SPDX 2.3 allows `GPL-2.0+` as equivalent to `GPL-2.0-or-later`. Both are valid but the `-or-later` form is more readable. Do not add `+` to permissive licenses (`MIT+` is not meaningful). |
| **Identifier case** | `mit or apache-2.0` is rejected because the identifiers `mit`/`apache-2.0` are not canonical case, not because of the operator (operators are case-insensitive). Type identifiers exactly: `MIT OR Apache-2.0`. |
| **`WITH` requires a valid exception id** | The token after `WITH` must be a recognised SPDX exception identifier (e.g. `LLVM-exception`, `Bison-exception-2.2`). Arbitrary strings are invalid. Full list: https://spdx.org/licenses/exceptions-index.html |
| **ASCII only** | The `license` field must be pure ASCII. Unicode characters (even in author attribution placed in the field) cause a parse error. |
