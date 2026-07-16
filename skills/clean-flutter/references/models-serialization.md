# Models & Serialization

freezed 3 for immutable models and unions, json_serializable for JSON, and the build_runner workflow that trips generated code up.

## freezed 3 (Mixed Mode)

Since freezed 3, a class with factory constructors must be declared `abstract` (a single data class) or `sealed` (a union):

```dart
@freezed
abstract class User with _$User {
  const factory User({
    required String id,
    required String name,
  }) = _User;

  factory User.fromJson(Map<String, dynamic> json) => _$UserFromJson(json);
}
```

Unions use `sealed`, which pairs with Dart pattern matching:

```dart
@freezed
sealed class AuthState with _$AuthState {
  const factory AuthState.signedOut() = SignedOut;
  const factory AuthState.signedIn(User user) = SignedIn;
}
```

freezed 3 **removed `.map`/`.when`**. Match with a native `switch` expression over the sealed type instead; it's exhaustive and compiler-checked:

```dart
final label = switch (state) {
  SignedOut() => 'sign in',
  SignedIn(:final user) => user.name,
};
```

- freezed gives value equality, `copyWith`, and `toString` for free. Don't hand-write `==`/`hashCode` on a freezed class.
- "Mixed mode" lets developer-defined constructors and properties coexist with generated code, so a class isn't all-or-nothing on codegen.

## JSON

- `json_serializable` handles (de)serialization; freezed delegates `fromJson`/`toJson` to it.
- Keep DTOs (the wire shape) separate from domain models when the API is awkward. Map DTO to domain in the data layer so a rename upstream doesn't ripple through the app.
- Parse JSON into a typed model at the boundary. Don't pass `Map<String, dynamic>` around and index it later; that's where implicit `dynamic` and runtime `null` bugs breed (see `pitfalls.md`).

## build_runner Workflow

- After editing an annotated class, run `dart run build_runner build --delete-conflicting-outputs`, or `dart run build_runner watch` during active development.
- **The staleness trap:** edit a model, forget to regenerate, and the old generated `fromJson`/`copyWith` still compiles against the *previous* shape. A new field reads back `null` with no error. Regenerate before trusting any model change, and treat "why is my new field empty" as a stale-codegen symptom first.
- Generated files are build output. Never hand-edit `*.freezed.dart` / `*.g.dart`.

## Alternatives and the Macro Question

- `dart_mappable` is the leading non-freezed option: JSON, equality, `copyWith`, and cleaner generics/polymorphism in one package with syntax closer to vanilla Dart. It's measurably slower at (de)serialization, a real trade-off. Pick it only when polymorphism pain outweighs the perf cost.
- Dart language macros were cancelled in early 2025 over hot-reload and compile-time cost. build_runner codegen is the standard and is staying; don't design around macros landing.
