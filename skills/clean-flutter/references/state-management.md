# State Management

Riverpod 3 with codegen as the default. Provider basics and the watch/read split live in `SKILL.md`; this file covers the judgment calls.

## Codegen Providers

Default to `@riverpod` codegen: write a function (derived/read-only value) or a class extending `_$Name` (state with methods). The return type drives the provider type, so there's no provider-class name to pick.

```dart
part 'counter.g.dart';

@riverpod
class Counter extends _$Counter {
  @override
  int build() => 0;

  void increment() => state++;
}
```

Provider naming gotcha: riverpod_generator strips a trailing `Notifier` from the class name
when deriving the provider (`class CounterNotifier` generates `counterProvider`, not
`counterNotifierProvider`). A `*Notifier`-suffixed ViewModel class is the common way to hit
`undefined_identifier` on the name you expected.

Async state returns a `Future`; the generated provider exposes an `AsyncValue<T>` with loading, data, and error branches. Render all three in the View, never assume data is present.

```dart
@riverpod
class UserList extends _$UserList {
  @override
  Future<List<User>> build() => ref.watch(userRepoProvider).fetchAll();
}
```

- **Always assign `state = ...` to publish a change.** Mutating the held object in place (`state.add(x)`) doesn't notify watchers, so a `watch` never fires and a `read` returns a stale value. Reassign a new value.
- **Never instantiate a `Notifier` by hand**, in app code or tests. Interact through its provider (`ref.read(counterProvider.notifier).increment()`).
- Riverpod 3 unified the type hierarchy: the 2.x `AutoDisposeNotifier`/`AutoDisposeRef` duplicates are gone, `Notifier` and `Ref` cover both. With codegen a provider is autoDispose by default; `@Riverpod(keepAlive: true)` keeps it alive.

## Watch vs Read vs Listen

| Method | Where | Effect |
|---|---|---|
| `ref.watch` | `build` / provider body | subscribe; rebuild or recompute when the value changes |
| `ref.read` | callbacks (`onPressed`, event handlers) | one-shot read, no subscription |
| `ref.listen` | `build` | run a side effect on change (snackbar, navigate) without rebuilding |

- Never `ref.watch` inside a callback: it re-subscribes on every call and leaks listeners.
- Never `ref.read` inside `build`: it reads once and misses later updates.
- Narrow a watch to one field with `.select`, so unrelated changes don't rebuild:

```dart
final name = ref.watch(userProvider.select((u) => u.name));
```

## DI Through Providers

The provider graph is the DI graph: compile-time checked, testable without a `BuildContext`. Inject a dependency by depending on its provider; override it for tests or flavors.

```dart
@riverpod
UserRepo userRepo(Ref ref) => UserRepo(ref.watch(dioProvider));
```

```dart
ProviderScope(
  overrides: [userRepoProvider.overrideWithValue(FakeUserRepo())],
  child: const App(),
);
```

`get_it` is the fallback service locator only when Riverpod isn't in the project, or when pure-Dart (non-widget) code needs DI. It has no compile-time graph check.

## Widgets and Ref

- `ConsumerWidget` / `ConsumerStatefulWidget` give a `WidgetRef` in `build`. Use `Consumer` to scope a rebuild to a small subtree inside an otherwise non-consumer widget.
- Riverpod 3 adds **Mutations**: a lifecycle-aware wrapper (idle, pending, success, error) for one-off side effects like a form submit. Reach for it over a hand-tracked `isLoading` bool when you have one.

## Legacy Tiers

- `ChangeNotifier`, `StateNotifier`, and the `Provider` package moved to legacy import paths. Don't reach for them in new code; migrate incrementally where you inherit them.
- Bloc/Cubit stays a reasonable pick for large teams that want enforced event-to-state discipline and an audit trail. It's a different model, not a Riverpod add-on: choose one per app.
