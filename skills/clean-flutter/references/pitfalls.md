# Pitfalls

The failure modes that pass `flutter run` once and bite later. These are the ones generated code produces most, so review for them first.

| # | Pitfall | Mechanism | Fix |
|---|---|---|---|
| 1 | `BuildContext` across an async gap | the widget is disposed or rebuilt while an `await` is pending; the stale `context` after resume crashes or silently no-ops | `if (!context.mounted) return;` immediately after the `await`, before any `context`/`Navigator`/`setState`. `use_build_context_synchronously` catches the common cases only |
| 2 | `setState` after dispose | the same async-gap applied to `setState`: "setState() called after dispose()" | `if (!mounted) return;` before a post-`await` `setState`; cancel timers and subscriptions in `dispose` |
| 3 | Unbounded constraints | a scrollable (`ListView`/`GridView`) placed directly in an unconstrained parent (`Column`, `Row`, another scroll on the same axis) has no bound to size against: "RenderBox was not laid out" / "unbounded height" | wrap in `Expanded`/`Flexible`, or give a bounded height. `shrinkWrap: true` works but lays out every child, so prefer `Expanded` for long lists |
| 4 | Rebuild storms | `setState` or `ref.watch` too high in the tree rebuilds the whole subtree for a localized change | push state down to the smallest widget; scope `watch` with `.select`; extract `const` subtrees; use `ref.listen` for side effects instead of watching |
| 5 | Missing `const` | a widget that could be `const` rebuilds needlessly | default to `const`; the lint flags it, so don't suppress |
| 6 | Implicit `dynamic` | inference silently picks `dynamic`, so a typo or wrong type slips through to runtime (decoded JSON maps are the usual source) | this is why `strict-inference`/`strict-casts`/`strict-raw-types` (very_good_analysis) exist. Type every boundary; parse JSON into typed models rather than passing `Map<String, dynamic>` around |
| 7 | build_runner staleness | editing an annotated model or provider without regenerating leaves old generated code compiling against the old shape | regenerate (`build_runner build --delete-conflicting-outputs`) after any annotated-source edit; `watch` during dev |
| 8 | `ref.watch`/`read` misuse | `watch` in a callback re-subscribes on every invocation; `read` in `build` reads once and misses updates | `watch` in `build`, `read` in callbacks, `listen` for side effects |
| 9 | Abandoned package | pub.dev is full of dead packages; a model tends to pick by name recognition, not liveness | check maintenance signals before adding (below and `packages.md`) |
| 10 | Overflow from fixed sizes | hardcoded widths/heights overflow on small screens or a large text scale | prefer `Flexible`/`Expanded`/`FittedBox`/`LayoutBuilder`; respect `MediaQuery` text scaling |

## Async-Gap Detail

The lint doesn't catch every case (it misses some indirection through helpers), so the `mounted` guard is a habit, not a lint dependency. In a `StatelessWidget` there's no `mounted`; use `context.mounted`. In a `State`, either `mounted` or `context.mounted` works.

## Picking a Live Package

Before adding any dependency, check its maintenance signals on pub.dev:

- **last publish date** (stale beyond roughly a year on a fast-moving library is a warning)
- **pub points and popularity**, but liveness beats popularity: a popular abandoned package is still a trap
- **open-vs-closed issue ratio** and whether the maintainer responds
- the **"supports latest Dart/Flutter SDK"** note on the package page

Named traps as of this writing (verify current status yourself, these rot):

- **Isar**: author left, Rust core is hard for the community to fork. Use Drift.
- **original Hive**: abandoned; Hive CE (community edition) is the maintained fork.
- **golden_toolkit**: discontinued; use alchemist.
- **GetX**: community guidance trends away from it toward Riverpod plus go_router.
