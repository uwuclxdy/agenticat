# Rust Cargo.toml: License Fields Reference

Load when setting `license` or `license-file` in `[package]`, or when writing or checking an SPDX expression.
Other publish metadata: `crates-io-metadata.md`. Auditing dependency licenses: `dep-hygiene.md`.

> _Captured 2026-07-10 (Rust/Cargo stable), audited against the Rust/Cargo 1.99 docs. To update: re-fetch the source URL(s) below, then diff for changes._

Sources: [manifest: license fields](https://doc.rust-lang.org/cargo/reference/manifest.html) | [SPDX license list](https://spdx.org/licenses/) | [SPDX 2.3 expression grammar](https://spdx.github.io/spdx-spec/v2.3/SPDX-license-expressions/) | [Rust API guidelines: licensing](https://rust-lang.github.io/api-guidelines/necessities.html)

## SPDX Expression Syntax

crates.io interprets the `license` field as an **SPDX 2.3 license expression** and validates it at publish time; every license name must be on SPDX license list 3.20. The grammar covers:

### Atoms

| Form | Meaning | Example |
|------|---------|---------|
| `<id>` | Single SPDX identifier | `MIT` |
| `<id>+` | This version or any later version | `GPL-2.0+`: deprecated spelling, write `GPL-2.0-or-later` |
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
# license = "MIT OR Apache-2.0"
# license = "MIT OR Apache-2.0 WITH LLVM-exception"
# license = "LGPL-2.1-only AND MIT AND BSD-2-Clause"
# license = "GPL-2.0-or-later WITH Bison-exception-2.2"
# license = "MIT AND (LGPL-2.1-or-later OR BSD-3-Clause)"
# license = "LicenseRef-Proprietary"
```

## Common Identifiers in Rust

Identifiers as they appear on crates.io, which validates names against SPDX license list 3.20.

| SPDX id | Category | Notes |
|---------|----------|-------|
| `MIT` | permissive | Most common single license; no patent grant; GPLv2-compatible |
| `Apache-2.0` | permissive | Explicit patent grant; GPLv2-incompatible on its own |
| `Apache-2.0 WITH LLVM-exception` | permissive | Adds GPLv2 compat + compiler-output exception; LLVM's license, not Rust's |
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

## The Rust Convention

### Why `MIT OR Apache-2.0`

Apache-2.0 adds an explicit patent grant MIT lacks but breaks GPLv2 compatibility on its own; pairing it with MIT under `OR` restores that compatibility while keeping the patent grant. Each user then picks either license. It is the de-facto crates.io default; the [Rust API guidelines](https://rust-lang.github.io/api-guidelines/necessities.html) recommend it for maximum compatibility.

### `Apache-2.0 WITH LLVM-exception` Variant

Used by LLVM, not by Rust: `rustc` and `std` are `MIT OR Apache-2.0`. The LLVM exception does two things:

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

With no `include` key both license texts ship unless git ignores or `exclude` matches them. Once `include` is set, list `LICENSE-*` in it: only a `license-file` is always included. Verify with `cargo package --list`.

## `license` vs `license-file`

| | `license` | `license-file` |
|---|-----------|----------------|
| Value type | SPDX expression string | relative path to a file |
| crates.io requirement | one of these two must be present | same |
| SPDX validation | yes; crates.io rejects non-SPDX strings | no; SPDX check is skipped entirely |
| Use case | any OSI / SPDX-listed license | proprietary, custom, or non-SPDX licenses |
| Path base | n/a | relative to the `Cargo.toml` (package root) |
| Behaviour | metadata only; you still ship the text | the named file is automatically included in the published crate |
| In a workspace member | `license.workspace = true` | `license-file.workspace = true`; the path is then relative to the workspace root |

> Setting both is technically allowed, but Cargo warns `only one of license or license-file is necessary`. crates.io keys its displayed licensing off the `license` SPDX field (a crate with only `license-file` shows as "non-standard"), so `license` is the authoritative one when both are set, not `license-file`. Pick one; prefer `license`.

```toml
# Standard open-source crate
license = "MIT OR Apache-2.0"

# Proprietary or unusual license
license-file = "LICENSE.txt"
```

## Gotchas

| Issue | Details |
|-------|---------|
| **Legacy `/` separator** | `MIT / Apache-2.0` is the old Cargo convention. crates.io still accepts `/` as an alias for `OR` (`allow_slash_as_or_operator` in its validator, with a passing unit test for `MIT/Apache-2.0`); it is legacy/discouraged, not rejected. Prefer `OR` for clarity: `MIT OR Apache-2.0`. |
| **Non-SPDX strings rejected** | Strings like `"MIT & Apache-2.0"` (`&` is not an SPDX operator), a prose name like `"Apache License 2.0"`, or any free-form text are rejected by crates.io when the `license` field is used (`/` is the exception, accepted as an `OR` alias). Use `license-file` for non-standard licenses instead. |
| **`LicenseRef-` for custom licenses** | SPDX allows `LicenseRef-<alphanumeric-and-hyphens>` for licenses not on the list. crates.io accepts this in the `license` field but provides no link or text; combine with `license-file` for the actual text. Example: `LicenseRef-Proprietary`. |
| **`-only` vs `-or-later` vs bare** | `LGPL-2.1`, `GPL-2.0`, etc. (without suffix) are deprecated SPDX identifiers. Prefer `LGPL-2.1-only` or `LGPL-2.1-or-later` explicitly. The bare forms still parse but trigger deprecation warnings in some tooling. |
| **`+` suffix vs `-or-later`** | `GPL-2.0+` is the deprecated spelling of `GPL-2.0-or-later`: write `-or-later`. Do not add `+` to permissive licenses (`MIT+` is not meaningful). |
| **Identifier case** | `mit or apache-2.0` is rejected because the identifiers `mit`/`apache-2.0` are not canonical case, not because of the operator (operators are case-insensitive). Type identifiers exactly: `MIT OR Apache-2.0`. |
| **`WITH` requires a valid exception id** | The token after `WITH` must be a recognised SPDX exception identifier (e.g. `LLVM-exception`, `Bison-exception-2.2`). Arbitrary strings are invalid. Full list: https://spdx.org/licenses/exceptions-index.html |
| **ASCII only** | The `license` field must be pure ASCII. Unicode characters (even in author attribution placed in the field) cause a parse error. |

With neither `license` nor `license-file`, `cargo package` warns and crates.io rejects the publish.

## Checklist

- [ ] `license` is an SPDX expression: exact-case identifiers, `OR` / `AND` / `WITH`, no `/`, no prose name.
- [ ] GNU licenses carry `-only` or `-or-later`.
- [ ] `license-file` only for a license with no SPDX identifier; never both fields.
- [ ] The license texts ship: `cargo package --list` shows `LICENSE-*`.
