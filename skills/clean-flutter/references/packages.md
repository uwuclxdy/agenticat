# Packages

Idiomatic picks for standard app problems, plus pubspec hygiene. Check maintenance signals (`pitfalls.md`) before adding any of these; package status rots.

| Problem | Idiomatic pick | Notes / runner-up |
|---|---|---|
| Structured / relational storage | **Drift** (SQL, compile-checked queries, migrations, reactive) | avoid Isar (unmaintained); ObjectBox when you need built-in sync |
| Simple key-value (flags, small cached blobs) | **Hive CE** (community edition, since original Hive is abandoned) | `shared_preferences` for trivial prefs only; it's slow at scale, never store structured data in it |
| Secure secrets (auth tokens) | **flutter_secure_storage** (Keychain / Keystore backed) | never keep tokens in `shared_preferences` |
| Networking | **Dio + Retrofit** (`retrofit_generator`) for typed clients | plain `http` for small, minimal-dependency apps |
| JSON serialization | **json_serializable** (pairs with Retrofit and freezed) | `dart_mappable` when polymorphism matters more than serialization speed |
| Forms / validation | **flutter_form_builder** (lower learning curve, built-in validators) | `reactive_forms` for an observable model with async validators and fields added at runtime |
| Lists / pagination | **infinite_scroll_pagination** with a cursor-based API | offset paging duplicates or skips rows under mutating data |
| Images / caching | **cached_network_image** (wraps `flutter_cache_manager`) | placeholders and error widgets built in |
| Background work | **workmanager** | see the platform asymmetry below |
| Permissions | **permission_handler** (de facto standard) | request at point of use; handle the permanently-denied case |
| i18n | **intl + flutter_localizations** with ARB files (full plural, gender, BiDi) | `slang` for compile-time-checked typed keys; `easy_localization` for quick prototypes only |

## Background Work Asymmetry

workmanager is reliable on Android (backed by WorkManager). On iOS it's **best-effort only**: BGTaskScheduler is OS-throttled with no guaranteed timing and a tight execution budget. Never rely on iOS background timing for correctness. This is the classic "works on Android, silently doesn't on iOS" bug, so design the flow to tolerate the task never running on time, and reach for `flutter_background_service` when you need longer-running foreground-style work.

## Pubspec Hygiene

- Caret ranges (`^`) for dependencies at 1.0 or above: pub resolves the best compatible version across the whole graph.
- **Exact-pin any 0.x dependency.** Semver gives no compatibility guarantee below 1.0, so every minor bump can break.
- Commit `pubspec.lock` for apps (reproducible builds); leave it out for published packages.
- Bump with `flutter pub upgrade` or `dart pub upgrade --major-versions`, not by hand-editing version strings.
- Every added dependency is a maintenance liability. Reach for the SDK or an existing dependency before adding one, and run it past the maintenance-signal check in `pitfalls.md`.
