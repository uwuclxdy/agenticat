# Testing

The test pyramid for Flutter: what each layer asserts, and the tooling for it.

| Layer | Tool | Asserts | Volume |
|---|---|---|---|
| unit | `test` / `flutter_test` | pure logic: view models, repositories (with faked data sources), `Result` mapping, domain rules | most tests |
| widget | `testWidgets` + `WidgetTester` | one widget's behavior: renders expected content, taps and scrolls drive state, conditional UI shows/hides | many |
| golden | `alchemist` | pixel snapshot of a widget across themes and sizes | targeted |
| integration | `integration_test` package | full app flows on a device or emulator | few |

## What Each Layer Asserts

- **Widget tests assert behavior and rendered output, not internals.** Pump the widget, find by text/key/type, tap, and assert the visible result. Don't pin a private method's call count.
- **Mock at the repository or data-source boundary** (`mocktail`), not the widgets under test. Inject the fake by overriding its provider in `ProviderScope(overrides: [...])`.
- **Riverpod in tests:** drive a notifier through its provider (`container.read(provider.notifier)`), never by constructing it. Use a `ProviderContainer` (with `addTearDown(container.dispose)`) for provider-only unit tests; use `ProviderScope` overrides for widget tests.

## Golden Tests

- `alchemist` is the current standard; `golden_toolkit` is discontinued.
- Alchemist splits **CI goldens** (text rendered as colored blocks, which dodges cross-platform font-rendering flake) from **platform goldens** (human-readable text for local review). Run CI goldens in the pipeline so a font-metric difference between machines doesn't fail the build.

## Integration Tests

Use the bundled `integration_test` package driving real flows, not the legacy `flutter drive` harness. Keep these few and reserved for critical end-to-end paths; they're the slowest and flakiest tier.

## Discipline

- A test that can't fail is a bug in the test. Assert exact expected values and the error and loading branches (`AsyncValue` carries all three), then watch it fail once (break the code or the assertion) before trusting green.
- Reproduce a reported bug with a failing widget or unit test *before* fixing it.
- `pump` advances a single frame; `pumpAndSettle` runs frames until animations finish. Use `pump(duration)` for timers you control; `pumpAndSettle` hangs on an indefinite animation (a spinner), so pump explicit durations there instead.
