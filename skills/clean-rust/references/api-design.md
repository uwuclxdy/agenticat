# API Design

Load when code adds or changes a public item: a name, a signature, a type, a constructor or builder, a module's exports.
Shaping public surfaces: naming, signatures, constructors, type-level guarantees, serde contracts. Trait and conversion rules are in `types-traits.md`.

## Naming

| Item | Form |
|---|---|
| types, traits, enum variants | `UpperCamelCase`, an acronym as one word: `Uuid`, not `UUID`. `non_camel_case_types`, `clippy::upper_case_acronyms` |
| functions, methods, fields, locals, macros | `snake_case`: `is_xid_start`. `non_snake_case` |
| consts and statics | `SCREAMING_SNAKE_CASE` |
| getter | the field's name: `user()`, never `get_user()`. `get`/`get_mut` only for a checked lookup returning `Option` |
| conversion method | `as_` free borrowed view, `to_` expensive, `into_` consumes `self`; `into_inner()` unwraps a wrapper. `clippy::wrong_self_convention` |
| iterator methods | `iter()` yields `&T`, `iter_mut()` yields `&mut T`, `into_iter()` yields `T` |
| iterator type | named after the method that returns it: `tokens()` returns `Tokens`, not `Tokenizer` |
| error type | verb-object-error like std's `ParseIntError`: `ParseAddrError`, not `AddrParseError`; one word order per crate |
| Cargo feature | what it adds: `std`, not `use-std`; features stay additive |
| name that collides with a keyword | trailing underscore: `crate_`. `r#crate` does not compile |

- Keep the crate name out of item names: `foo::Id`, not `foo::FooId`.
- No `Service`, `Manager` or `Factory` in a type name; name the specific job: `BookingDispatcher`.

## Signatures

```rust
// WRONG: fn three_vowels(word: &String) -> bool   rejects the literal "Ferris"
// WRONG: fn total(items: &Vec<u32>) -> u32        rejects arrays and slices
fn three_vowels(word: &str) -> bool {
    word.chars().filter(|c| "aeiou".contains(*c)).count() == 3
}

fn total(items: &[u32]) -> u32 {
    items.iter().sum()
}
```

| The function | Takes |
|---|---|
| reads a string | `&str`, never `&String`. `clippy::ptr_arg` |
| reads a boxed value | `&T`, never `&Box<T>`. `clippy::borrowed_box` |
| reads or edits elements without growing | `&[T]` / `&mut [T]`, never `&Vec<T>` / `&mut Vec<T>` |
| reads a path | `&Path` or `impl AsRef<Path>`, never `&PathBuf`, and never a `String` for an OS path |
| only iterates | `impl IntoIterator<Item = T>` |
| needs to own the value | `T` by value; never borrow and then clone |
| only reads the value | `&T`; never take ownership and then drop |
| reads or writes bytes once | `impl std::io::Read` / `impl std::io::Write`, not `File` or `TcpStream` |
| takes two values that must share one type | one type parameter: `fn combine<T: Trait>(x: T, y: T) -> T`, not `<A: Trait, B: Trait>` |
| needs a flag | an enum, not `bool`: `write_file(path, data, WriteMode::Append)`; a bare `true` at a call site is opaque. `clippy::fn_params_excessive_bools` (several bools) |

- Return values, not out-parameters. A `&mut` parameter is for a buffer the caller owns and reuses (`read(&mut self, buf: &mut [u8])`).
- Return `impl Iterator<Item = T>` instead of a collected `Vec<T>` when callers only iterate.
- Return what the function already computed instead of collapsing it to a `bool`: `binary_search` returns `Result<usize, usize>`, the match or the insertion point.
- Keep parameters in one order across related functions, a ubiquitous one (`&logger`) last. Closure parameters go last, and a function takes at most one.
- A library hands back futures and starts no task that outlives the call; it stays runtime-independent. Only the binary picks the executor and spawns.
- Keep `Rc<T>`, `Arc<T>`, `Box<T>` and `RefCell<T>` out of public signatures: take `&T`, `&mut T` or `T` and hide the wrapper. Exception: the pointer is the API's point (a container type, `Box<dyn Trait>`).
- Prefer `std` types in public signatures; a third-party type there makes that crate part of your API. Two versions of one crate in the graph are two distinct types: `foo` 1.x's `Bar` never stands in for `foo` 2.x's `Bar`.
- Minimize arguments; prefer the natural receiver (`smtp.send(message)` over `send_email(message, smtp)`). When two call sites stitch the same sequence of calls together, push the combination behind a method on the receiving type.
- CQS is a guideline, not law, in Rust: `vec.pop()`, `entry().or_insert()`, `iter.next()` mutate and return, and that's idiomatic. Do avoid names that read as pure queries but mutate.
- Write direct accessors, not a wrapper struct that exists only to group two values a single caller wanted together.

## Newtypes

Wrap each distinct meaning of a primitive (a unit, an id) so mixing them cannot compile:

```rust
// WRONG: fn are_we_there_yet(distance_travelled: f64) -> bool   miles or kilometers?
struct Miles(pub f64);
struct Kilometers(pub f64);

fn are_we_there_yet(distance_travelled: Miles) -> bool {
    distance_travelled.0 >= 100.0
}
```

A `type` alias is a synonym, not a distinct type. Beyond swap-proofing arguments, newtypes solve two structural problems:

- **Orphan rule**: an impl is rejected when neither the trait nor any type in the impl header is local (`impl From<LocalType> for ForeignType` is fine: the local type appears as the trait's argument; fundamental wrappers like `Box<Local>` and `&Local` count as local). A bare type parameter doesn't help: `impl<T> ForeignTrait for ForeignType<T>` is rejected whenever `ForeignType` is foreign. When you're stuck, wrap the foreign type in a local newtype and implement on the wrapper; add `From`/`Into` and `into_inner()` so callers move in and out without friction.
- **Validated input**: parse untrusted input into a newtype whose constructor enforces the invariant (`Port::new(u16) -> Result<Port>`), then pass the newtype around instead of re-checking a primitive at every call site. Keep its field private and give it no infallible `From<u16>`: both let a caller skip the check.

`#[repr(transparent)]` on a single-field newtype guarantees the inner type's layout: mandatory when the wrapper crosses FFI or gets pointer-cast, good practice otherwise. `#[repr(C)]` fixes the layout but not the call ABI.

## Typestate for Illegal-Transition Bugs

When an object has a real state machine (connection: disconnected → connected → authenticated), encode states as types and transitions as consuming methods:

```rust
// fragment
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

- A constructor is a static inherent function named `new`, never a free function; it returns `Self`, or `Result<Self, E>` when construction can fail (`Port::new(u16) -> Result<Port>`).
- A `new()` without arguments comes with a `Default` impl that returns the same value. `clippy::new_without_default`
- Builder over `..Default::default()` struct literals once a config struct has several optional fields: `Client::builder().timeout(t).retries(3).build()` reads at the call site; a literal with `..Default::default()` hides which fields matter.
- Builder shape: `Foo::builder()` returns `FooBuilder`; setters are named after the value (`name(..)`, not `set_name(..)`) and are infallible; `build()` does all validation and is the only step that returns `Result`.
- One builder chains one way: every setter `mut self -> Self`, or every setter `&mut self -> &mut Self`. Never mix them.
- Keep struct fields private behind a `pub` constructor and getters; `pub` fields only on passive data.
- Derive the common traits a public type's fields allow: `Debug`, `Clone`, `PartialEq`, plus `Eq`, `Hash`, `Default`, `Copy`, `PartialOrd`, `Ord` where they hold (never derive `Eq` or `Ord` over a float field). A type holding a secret gets a redacting `Debug` instead (`observability.md`). `missing_debug_implementations`
- Put no derivable bound on a generic struct: `#[derive(Clone, Debug)] struct Good<T>`, not `struct Bad<T: Clone + Debug>`.
- Cleanup that can fail gets an explicit `close` method returning `Result`; `Drop` stays best-effort and never panics.

## Public Surface

- Items are private by default. Use `pub(crate)` for crate-internal API; never mark a helper `pub` because someone might need it. `unreachable_pub`
- `pub` on a struct leaves its fields private; `pub` on an enum makes every variant public.
- Expose each public item through one path. Never `pub use foo::*`, and do not re-export another crate's items. Never glob-import another crate (`use other::*`): its next release can add a name that collides with yours.
- A technically-correct change that breaks a user contract (CLI flags, config keys, env semantics) keeps the legacy path, ships the new one alongside, and milestones the removal for the next major. Warn only on genuine old-vs-new conflicts: end users on only-old or only-new see nothing. A change to an existing default ships opt-in/off by default, unless the old behavior is broken for every user (then on by default with an opt-out) or the behavior it breaks is incidental/unsupported (then it ships as the new default without an opt-in).

## Future-Proofing Public Enums and Structs

`#[non_exhaustive]` on public enums/structs you expect to grow forces downstream code to stay open: a `_` arm in every `match` on the enum, `..` in every pattern on the struct. That is the inverse of the internal no-wildcard rule (`types-traits.md`), and correct here: *you* control internal dispatchers, but you can't fix downstream crates when you add a variant. It also stops downstream crates from building the struct, or a marked variant, with a literal, so ship a constructor; inside the defining crate it changes nothing. `#[must_use]` on types and functions whose ignored result is a bug (`Result` already has it; add it to builders and guards).

Sealed traits close the remaining door: a public trait you'll need to add methods to without a breaking change gets a private supertrait:

```rust
mod sealed { pub trait Sealed {} }
pub trait Backend: sealed::Sealed { /* callable, not implementable downstream */ }
```

Downstream crates can call it but can't implement it, so a new method with a default body isn't a breaking change.

## `Option<NonZero*>` Is Free

`NonZeroU32` and friends give the compiler a niche: `Option<NonZeroU32>` is the same size as `u32`. Use them for IDs, counts, and handles where zero is invalid anyway: the invariant documents itself and the `Option` costs nothing. `NonZeroU32` is a type alias of `NonZero<u32>`; the generic spelling compiles from 1.79.

## Serde Contracts

Public data structures implement `Serialize` and `Deserialize`, behind a `serde` feature when the dependency is optional. Pick enum tagging deliberately; the default rarely matches an external API:

| Strategy | Attribute | Wire form | Tuple variants |
|---|---|---|---|
| External (default) | n/a | `{"Circle":{"radius":5}}` | yes |
| Internal | `#[serde(tag = "type")]` | `{"type":"Circle","radius":5}` | **no** |
| Adjacent | `#[serde(tag = "t", content = "c")]` | `{"t":"Circle","c":{"radius":5}}` | yes |
| Untagged | `#[serde(untagged)]` | `{"radius":5}` | yes |

- Internally tagged enums can't hold tuple variants or newtype-wrapped primitives; reach for adjacent tagging.
- Untagged tries variants in declaration order: slower, can silently pick the wrong variant, and produces vague errors. Reserve it for small, structurally distinct sets.
- `#[serde(rename_all = "camelCase")]` at the struct level, not per-field renames.
- `#[serde(deny_unknown_fields)]` on config structs turns typos in user config into errors instead of silently ignored keys (incompatible with `#[serde(flatten)]`).

## Checklist

- [ ] Names follow the table: no `get_` getter, no `UUID`-style acronym, `as_`/`to_`/`into_` match their cost.
- [ ] No `&String`, `&Vec<T>` or `&PathBuf` parameter; no `bool` flag parameter.
- [ ] No `Rc`/`Arc`/`Box`/`RefCell` or third-party type leaks through a public signature without a reason.
- [ ] Values with distinct meanings are newtypes; a newtype for a validated value keeps its field private and has a checking constructor.
- [ ] A `new()` without arguments has a matching `Default`; a builder validates only in `build()`.
- [ ] Nothing is `pub` that could be `pub(crate)`; no glob re-export.
- [ ] A public enum or struct expected to grow is `#[non_exhaustive]`; such a struct or marked variant has a constructor.
- [ ] Each serialized enum has a deliberately chosen tagging.
