# Architecture

Feature-first layout, MVVM inside a feature, and the `Result` boundary. Project-shaping rules; the always-on discipline is in `SKILL.md`.

## Feature-First, Not Layer-First

Group by feature, layer inside each feature. Layer-first (`models/`, `services/`, `widgets/` at the top) scatters one feature's files across the tree and gets painful as the app grows. Reserve it for a genuinely tiny single-screen app.

```
lib/src/
  core/                     shared: theme, router, Result, common widgets, env
  features/
    auth/
      data/                 repositories + data sources (API clients, DB, DTOs)
      domain/               models + logic spanning repos (pure Dart, no Flutter import)
      presentation/         widgets (View) + view models (Riverpod notifiers)
    profile/
      data/ domain/ presentation/
```

## MVVM Inside a Feature

| Layer | Holds | May depend on |
|---|---|---|
| presentation | View (widgets) + ViewModel (a Riverpod `Notifier`/`AsyncNotifier`) | domain |
| domain | immutable models, optional use-case/service classes for logic crossing repos | nothing (pure Dart) |
| data | repositories, data sources, DTOs, API clients, DB access | domain |

- The View watches its ViewModel and renders; it holds no business logic. The ViewModel exposes UI state and calls repositories.
- Dependency points inward: presentation to domain to data. The View never imports a data source; it goes through a repository. The domain layer imports no Flutter.
- Keep DTOs (the wire shape) out of the domain. Map DTO to domain model in the data layer so an ugly API can't leak its shape across the app.

## The `Result` Boundary

Dart exceptions are invisible in the type system: nothing forces a caller to handle a throw, so an uncaught one becomes a runtime crash. A sealed `Result<T>` moves the failure path into the signature, checked by `switch` exhaustiveness.

```dart
sealed class Result<T> {
  const Result();
}

final class Ok<T> extends Result<T> {
  const Ok(this.value);
  final T value;
}

final class Failure<T> extends Result<T> {
  const Failure(this.error);
  final Object error;
}
```

Repositories contain the `try/catch` and translate throws into `Result`. Nothing leaks to callers:

```dart
Future<Result<User>> fetchUser(String id) async {
  try {
    final dto = await _api.getUser(id);
    return Ok(dto.toDomain());
  } on DioException catch (e) {
    return Failure(NetworkError(e));
  }
}
```

Callers `switch` instead of wrapping every call in `try/catch`:

```dart
switch (await repo.fetchUser(id)) {
  case Ok(:final value):
    state = AsyncData(value);
  case Failure(:final error):
    state = AsyncError(error, StackTrace.current);
}
```

- Only wrap **expected** failures (network down, file missing, bad input) in `Result`. Let programmer errors throw and crash-report.
- The real cost: chaining several sequential `Result`-returning async calls is more verbose than `try/catch`, since each step unwraps by hand. Worth it at the repository boundary; don't thread `Result` through every internal helper.
- Ready-made packages (`result_dart`, `multiple_result`) exist if you'd rather not hand-roll, but the sealed class above is about ten lines and adds no dependency. freezed can generate the union too.
