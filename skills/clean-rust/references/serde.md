# Serde

- Load when deriving or implementing `Serialize`/`Deserialize`, choosing `#[serde(..)]` attributes, or shaping JSON and other wire formats.
- Writing a data format itself (a `Serializer` or `Deserializer`) is not covered here.

## Setup

```toml
[dependencies]
serde = { version = "1", features = ["derive"] }
```

- Without the `derive` feature every `#[derive(Serialize, Deserialize)]` line fails.
- Derive plus attributes first. Hand-write `impl Serialize` or `impl Deserialize` only when no attribute can express the need.
- A library's data types implement both traits. Optional serde is a feature named `serde`: `#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]`.

## Attributes

| Want | `#[serde(..)]` | On |
|---|---|---|
| camelCase keys | `rename_all = "camelCase"` | container |
| one key spelled differently | `rename = "id"` | field, variant |
| a different key on input only | `rename(deserialize = "id")` | field, variant |
| accept an old key as well | `alias = "old_name"` | field, variant |
| missing field becomes `Default` | `default` | field, or container for every field |
| missing field from a function | `default = "default_port"`: a path, no `()` | field |
| leave out `None` or empty values | `skip_serializing_if = "Option::is_none"`: a path, no closure | field |
| never read or write a field | `skip` | field |
| error on unknown keys | `deny_unknown_fields` | container |
| keep unknown keys | `flatten` on a `HashMap<String, Value>` field | field |
| inline a nested struct's keys | `flatten` | field |
| one-field struct as its inner value | `transparent` | container |
| validate while deserializing | `try_from = "Raw"` | container |
| custom encoding for one field | `with = "module"` | field |

- `rename_all` takes an exact string: `lowercase`, `UPPERCASE`, `PascalCase`, `camelCase`, `snake_case`, `SCREAMING_SNAKE_CASE`, `kebab-case`, `SCREAMING-KEBAB-CASE`. `CamelCase` and `TitleCase` do not exist.
- An attribute on the wrong level fails to compile or silently does nothing.
- Unknown input keys are ignored unless `deny_unknown_fields` is set.
- `skip_serializing` alone still requires the field on input. `skip` covers both directions.
- Never combine `flatten` with `deny_unknown_fields`, on either struct.
- A missing value gets its default from `default`, not from an `Option<T>` field unwrapped at every use.
- An `Option<T>` field is already optional on input: no `#[serde(default)]` on it.

```rust
use std::collections::HashMap;

use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct User {
    user_name: String, // "userName"
    #[serde(default)]
    retries: u32, // missing -> 0
    #[serde(default = "default_port")] // WRONG: "default_port()"
    port: u16,
    #[serde(skip_serializing_if = "Option::is_none")]
    nickname: Option<String>, // left out, not `null`
    #[serde(alias = "colour")]
    color: String,
    #[serde(skip)] // WRONG: skip_serializing (input would still require it)
    cache: Vec<u8>,
    #[serde(flatten)]
    extra: HashMap<String, serde_json::Value>, // unknown keys survive a round trip
}

fn default_port() -> u16 {
    8080
}
```

## Enums

```rust
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case", rename_all_fields = "camelCase")]
enum Event {
    Login { user_id: u64 }, // {"type":"login","userId":1}
    Logout,                 // {"type":"logout"}
    // WRONG: Batch(Vec<u64>)  a tuple variant does not compile under `tag`
    #[serde(other)]
    Unknown, // any tag a newer sender adds
}
```

| Attribute on the enum | JSON for `Login { user_id: 1 }` |
|---|---|
| none (externally tagged, the default) | `{"Login":{"user_id":1}}` |
| `#[serde(tag = "type")]` | `{"type":"Login","user_id":1}` |
| `#[serde(tag = "t", content = "c")]` | `{"t":"Login","c":{"user_id":1}}` |
| `#[serde(untagged)]` | `{"user_id":1}` |

- Pick the representation from the wire format you must match. Never hand-write impls to reshape an enum.
- On an enum `rename_all` renames the variants. `rename_all_fields` renames the fields inside struct variants.
- `untagged` tries the variants top to bottom and keeps the first that fits: most specific first, catch-alls (`serde_json::Value`, a struct whose fields all default) last.
- Give an `untagged` enum `#[serde(expecting = "an integer or a string")]`. Without it the error names no accepted shape.
- Internally tagged (`tag`) enums can't hold tuple variants or newtype-wrapped primitives; reach for adjacent tagging (`tag`, `content`).
- `#[serde(other)]` on a unit variant of an internally or adjacently tagged enum catches tags added later. It is not allowed on any other enum.
- Put `#[serde(other)]` on the last variant of the enum. On any earlier one serde_derive fails: `#[serde(other)] must be on the last variant`.
- A variant marked `skip_serializing` is an error to serialize, not an omission.
- A C-like enum as integers: the `serde_repr` crate's `Serialize_repr` and `Deserialize_repr` derives with `#[repr(u8)]`.

## Borrowing and Bounds

- Generic over input the caller owns: `fn load<'de, T: Deserialize<'de>>(input: &'de str)`. Input created or dropped inside the function (a decoded buffer, a reader): `T: DeserializeOwned`.
- Never `T: Deserialize<'static>`.
- `&'a str` fields borrow from the input and allocate nothing, but only while the input outlives the value. With `from_reader` use `String` fields.
- Only `&str` and `&[u8]` borrow on their own. `Cow<'a, str>` and nested borrowing types need `#[serde(borrow)]`.
- A `&'a str` field takes only text borrowed verbatim from the input, which a JSON string with escapes is not: use `Cow<'a, str>` with `#[serde(borrow)]`.

## Custom Field Logic

```rust
// A module for `#[serde(with = "u64_as_string")]`: both signatures are fixed.
use serde::{Deserialize, Deserializer, Serializer};

pub fn serialize<S>(value: &u64, serializer: S) -> Result<S::Ok, S::Error>
where
    S: Serializer,
{
    serializer.serialize_str(&value.to_string())
}

pub fn deserialize<'de, D>(deserializer: D) -> Result<u64, D::Error>
where
    D: Deserializer<'de>,
{
    let text = String::deserialize(deserializer)?;
    text.parse().map_err(serde::de::Error::custom)
}
```

- WRONG helper shapes: the value by value, a `String` return, a concrete serializer type. Each fails inside the derive, far from the helper.
- A foreign type without the traits: `serialize_with`/`deserialize_with` (or `with`) on the field, not a wrapper newtype.
- A generic field read through such a helper needs its inferred bound replaced: `#[serde(bound(deserialize = "T: FromStr, T::Err: Display"))]`.
- Validation: `#[serde(try_from = "u16")] struct Port(u16);` plus `impl TryFrom<u16> for Port` whose error is `Display`. `into = "Wire"` needs `Clone` and `Into<Wire>`.

## Manual Impls

- Stay generic over the format: `fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error>` and `D: Deserializer<'de>`. Never name a concrete serializer type.
- A sequence or map takes three steps: `serialize_seq(Some(self.len()))` then `serialize_element(v)` per item, or `serialize_map(Some(self.len()))` then `serialize_entry(k, v)` per pair, then `.end()`. Never skip `.end()`.
- A struct visitor implements both `visit_seq` and `visit_map` and is driven by `deserialize_struct("Name", FIELDS, visitor)`, never by `deserialize_map`.
- Avoid `deserialize_any`: it only works with self-describing formats. Give the exact hint (`deserialize_str`, `deserialize_struct`).
- `visit_map` loops until the map is empty (`while let Some(key) = map.next_key()?`) and reports `duplicate_field`, `unknown_field` and `missing_field`. No `unwrap` or `expect`, no `_ => {}` arm.
- Derive the field-name enum: `#[derive(Deserialize)] #[serde(field_identifier, rename_all = "lowercase")]`.
- Implement the `visit_*` method the format really calls, not only the one the hint names: JSON delivers every signed integer through `visit_i64` and every unsigned one through `visit_u64`.
- Narrow an integer with a range check that fails with `E::custom(..)`, never with a bare `as`.
- `visit_str` receives a short-lived `&str`: store `v.to_owned()`.
- Skip a value with `IgnoredAny`, not by deserializing it into a throwaway type.

## JSON Shapes

- `serde_json` writes a newtype struct as its inner value, a tuple struct as an array, a unit struct as `null`.
- Default enum variants: unit `"Z"`, newtype `{"Y":0}`, tuple `{"X":[0,0]}`, struct `{"W":{"a":0}}`.

## Checklist

- [ ] `serde` has the `derive` feature, and nothing an attribute covers is implemented by hand.
- [ ] Every attribute sits on the right level and uses an exact value string.
- [ ] `default = ".."` and `skip_serializing_if = ".."` hold paths without `()`.
- [ ] A type that is both read and written uses `skip`, not `skip_serializing`.
- [ ] No `flatten` beside `deny_unknown_fields`.
- [ ] The enum representation matches the wire format; `untagged` variants run from specific to general; `#[serde(other)]` sits on the last variant.
- [ ] Borrowed fields are never filled from a reader; no `Deserialize<'static>` bound.
- [ ] Manual impls are generic over `S` and `D`, call `.end()`, and never narrow with `as`.
