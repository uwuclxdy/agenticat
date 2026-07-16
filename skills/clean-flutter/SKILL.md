---
name: clean-flutter
description: "Clean, idiomatic Flutter and Dart conventions: feature-first architecture, Riverpod state and DI, widgets and const correctness, freezed models, go_router navigation, error handling, testing, and pub package hygiene. Use when writing, reviewing, or refactoring any Flutter or Dart code, and whenever widgets, BuildContext, build_runner, 'flutter best practices', or 'idiomatic dart' come up."
metadata:
  author: uwuclxdy
  version: "1.1"
---

# Clean Flutter

Flutter and Dart conventions for writing, reviewing, and refactoring. The core rules below always apply. Load the one reference file matching the task's domain; don't load them all.

If the `clean-code` skill is installed, its language-agnostic principles (function size, naming hygiene, comment discipline) still apply. Where generic advice conflicts with Flutter idiom, this skill wins: "replace switch with polymorphism" maps to exhaustive `switch` over a sealed class, which in Dart is the intended tool, not a smell.

| Task touches | File |
|---|---|
| Project layout, MVVM layering, repository boundaries, `Result` | `references/architecture.md` |
| Providers, `Notifier`/`AsyncNotifier`, `ref.watch`/`read`/`listen`, DI, autoDispose | `references/state-management.md` |
| Routes, deep links, nested or guarded navigation | `references/navigation.md` |
| Data models, freezed, JSON serialization, build_runner workflow | `references/models-serialization.md` |
| Writing tests: unit, widget, golden, integration | `references/testing.md` |
| Rebuild storms, async-gap crashes, layout overflow, `dynamic` leaks | `references/pitfalls.md` |
| Picking a package (storage, network, forms, i18n, background), pubspec hygiene | `references/packages.md` |

## Toolchain & Setup

- Pin the Flutter SDK with fvm (`.fvmrc`, `fvm use`) and commit the pin so every machine and CI build the same stable SDK.
- `very_good_analysis` in `analysis_options.yaml` as the lint floor. It layers `strict-casts`, `strict-raw-types`, and `strict-inference` on top of `flutter_lints`, catching the exact classes of mistake generated code produces (implicit `dynamic`, unchecked casts). Fix warnings; never loosen a rule to silence one. `flutter analyze` stays clean in CI.
- Codegen (`freezed`, `json_serializable`, `riverpod_generator`, `retrofit`) runs through `dart run build_runner build --delete-conflicting-outputs`. Generated `*.g.dart` and `*.freezed.dart` are build output: regenerate after editing the annotated source, never hand-edit them. Detail in `references/models-serialization.md`.

## Widgets & Build

- `build()` is pure: no side effects, no I/O, no allocation you can hoist out. It runs often; assume every rebuild is free to happen at any time.
- `const` wherever the analyzer allows (`prefer_const_constructors`). A `const` widget is skipped on rebuild, the cheapest perf win and the one generated code drops most.
- Extract widget subtrees into their own `StatelessWidget`/`ConsumerWidget` classes, not `Widget _buildFoo()` methods. A helper method rebuilds with its parent and can't be `const`; a widget class gets its own rebuild boundary and const-ness.
- Compose small widgets. A deep `build` method that could be five classes is the Flutter equivalent of a 200-line function.
- `Key`s only where identity matters (reordered or inserted list items, state preserved across a position change). Don't scatter keys nothing reads.

## State

- Riverpod with codegen (`@riverpod`) is the default for both state and DI. `ref.watch` in `build` to react to changes; `ref.read` in callbacks and event handlers for a one-shot read. Watching in a callback re-subscribes on every call; reading in `build` misses updates. Detail in `references/state-management.md`.
- Push state to the smallest widget that needs it. Scope `ref.watch` with `.select(...)` so a one-field change doesn't rebuild the whole screen.
- `setState` is fine for genuinely local ephemeral state (a toggle, focus, an animation flag). Not for app state or anything shared across widgets.

## Async & Lifecycle

- After any `await` inside a `State` or callback, a `BuildContext` may be dead. Guard with `if (!context.mounted) return;` (or `if (!mounted) return;` in a `State`) before touching `context`, `Navigator`, `setState`, or a controller. `use_build_context_synchronously` flags the common cases, not all of them.
- Dispose what you create. `TextEditingController`, `ScrollController`, `AnimationController`, `FocusNode`, and `StreamSubscription` all leak and can fire after teardown without a matching `dispose()`/`cancel()`.

## Errors

- Repositories catch throwing calls (network, disk, platform channels) internally and return a sealed `Result<T>` (`Ok`/`Error`); callers `switch` on it exhaustively. The failure path becomes part of the signature instead of an invisible throw. Detail in `references/architecture.md`.
- Let genuine bugs (programmer error, broken preconditions) throw and reach crash reporting. Don't wrap them in a `try/catch` that swallows them into a silent no-op.

## Naming & Style

- `lowerCamelCase` for members and locals, `UpperCamelCase` for types, `lowercase_with_underscores` for files and directories. Match `dart format`; never hand-format around it.
- Private by default (`_name`); widen visibility only when another library needs it.
- `async`/`await` over raw `.then()` chains. Type every public signature and let strict-inference reject accidental `dynamic`.

## Pre-Submit Checklist

- [ ] `flutter analyze` clean under very_good_analysis; no rule loosened to pass
- [ ] codegen regenerated after any model/provider edit; no hand-edited `*.g.dart`/`*.freezed.dart`
- [ ] `const` on every eligible widget; subtrees extracted to classes, not `_build` methods
- [ ] no `BuildContext`/`Navigator`/`setState` after an `await` without a `mounted` guard
- [ ] every controller, subscription, and notifier disposed
- [ ] `ref.watch` in build, `ref.read` in callbacks, `ref.listen` for side effects; watch scoped with `.select`
- [ ] repository calls return `Result`; genuine bugs throw rather than being swallowed
- [ ] no unmaintained package added (pub.dev signals checked, see `references/packages.md`)
- [ ] tests fail if the logic breaks; layer chosen per the pyramid (`references/testing.md`)
