# API Design

Shaping public surfaces: constructors, type-level guarantees, serde contracts.

## Newtypes

Beyond swap-proofing arguments (`UserId(u64)` vs `OrderId(u64)`, see `SKILL.md`), newtypes solve two structural problems:

- **Orphan rule**: `impl ForeignTrait for ForeignType` is rejected — always, even with a type parameter in between. Wrap the foreign type in a local newtype and implement on the wrapper. Add `From`/`Into` and `into_inner()` so callers move in and out without friction.
- **Validated input**: parse untrusted input into a newtype whose constructor enforces the invariant (`Port::new(u16) -> Result<Port>`), then pass the newtype around instead of re-checking a primitive at every call site.

`#[repr(transparent)]` on a single-field newtype guarantees the inner type's layout — mandatory when the wrapper crosses FFI or gets pointer-cast, good practice otherwise.

## Typestate for Illegal-Transition Bugs

When an object has a real state machine (connection: disconnected → connected → authenticated), encode states as types and transitions as consuming methods:

```rust
struct Disconnected;
struct Connected { stream: TcpStream }

impl Client<Disconnected> {
    fn connect(self) -> io::Result<Client<Connected>> { /* ... */ }
}
impl Client<Connected> {
    fn send(&mut self, msg: &[u8]) -> io::Result<()> { /* ... */ }
}
```

Calling `send` before `connect` is now a compile error, not a runtime check. Worth the ceremony when misuse is plausible and costly; skip it for two-state flags a `bool` field covers.

## Constructors and Configuration

- Builder over `..Default::default()` struct literals once a config struct has several optional fields — `Client::builder().timeout(t).retries(3).build()` reads at the call site; a literal with `..Default::default()` hides which fields matter.
- Enums over boolean parameters: `write_file(path, data, WriteMode::Append)` — a bare `true` at a call site is opaque.
- Direct accessors over wrapper structs that exist only to group two values a single caller wanted together.
- Minimize arguments; prefer the natural receiver (`smtp.send(message)` over `send_email(message, smtp)`). When two call sites stitch the same sequence of calls together, push the combination behind a method on the receiving type.
- CQS is a guideline, not law, in Rust: `vec.pop()`, `entry().or_insert()`, `iter.next()` mutate and return, and that's idiomatic. Do avoid names that read as pure queries but mutate.

## Future-Proofing Public Enums and Structs

`#[non_exhaustive]` on public enums/structs you expect to grow forces downstream `match`es to carry a `_` arm — the inverse of the internal no-wildcard rule, and correct here: *you* control internal dispatchers, but you can't fix downstream crates when you add a variant. `#[must_use]` on types and functions whose ignored result is a bug (`Result` already has it; add it to builders and guards).

## `Option<NonZero*>` Is Free

`NonZeroU32` and friends give the compiler a niche: `Option<NonZeroU32>` is the same size as `u32`. Use them for IDs, counts, and handles where zero is invalid anyway — the invariant documents itself and the `Option` costs nothing.

## Serde Contracts

Pick enum tagging deliberately; the default rarely matches an external API:

| Strategy | Attribute | Wire form | Tuple variants |
|---|---|---|---|
| External (default) | — | `{"Circle":{"radius":5}}` | yes |
| Internal | `#[serde(tag = "type")]` | `{"type":"Circle","radius":5}` | **no** |
| Adjacent | `#[serde(tag = "t", content = "c")]` | `{"t":"Circle","c":{"radius":5}}` | yes |
| Untagged | `#[serde(untagged)]` | `{"radius":5}` | yes |

- Internally tagged enums can't hold tuple variants or newtype-wrapped primitives — reach for adjacent tagging.
- Untagged tries variants in declaration order: slower, can silently pick the wrong variant, and produces vague errors. Reserve it for small, structurally distinct sets.
- `#[serde(rename_all = "camelCase")]` at the struct level, not per-field renames.
- `#[serde(deny_unknown_fields)]` on config structs turns typos in user config into errors instead of silently ignored keys (incompatible with `#[serde(flatten)]`).
