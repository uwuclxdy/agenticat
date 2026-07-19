# Testing Ratatui TUIs

Non-trivial render logic ships with tests that fail if the logic breaks (repo rule). ratatui
makes TUI render tests cheap; there is no excuse for an untested widget library.

## The Core Pattern: TestBackend

```rust
use ratatui::{Terminal, backend::TestBackend};

#[test]
fn renders_header() {
    let mut terminal = Terminal::new(TestBackend::new(40, 5)).unwrap();
    terminal.draw(|f| render_header(f, f.area(), &fixture())).unwrap();
    terminal.backend().assert_buffer_lines([
        "┌status────────────────────────────────┐",
        // ... one string per row, exact match incl. borders
    ]);
}
```

- `assert_buffer_lines([...])` is the primary assertion: exact rows, catches layout drift.
- `TestBackend::assert_buffer(&Buffer)` for comparing against a constructed `Buffer` (e.g.
  `Buffer::with_lines(..)` then `buf.set_style(..)` when styles matter, not just glyphs).
- Style-aware checks: build the expected `Buffer` and set styles on it; string lines compare
  symbols only.

## Audit-Driven Rules (What Our Repos Got Wrong)

1. **No buffer→String + `.contains()` assertions.** 5/6 repos hand-rolled buffer flattening
   with substring checks: misses layout regressions, duplicates helper code per test file.
   Use `assert_buffer_lines` for exact-match cases; if only a fragment is stable, one SHARED
   flatten helper per repo, not per file.
2. **Exercise the state, not just the happy path.** A render fn tested only through app-level
   draws with default state can have zero real coverage: one repo ran `render_overlays` in
   every test while toasts/modals were always empty, so none of the modal/toast code ever
   executed. Construct fixtures that populate the state the branch needs.
3. **Pure render fns are unit-test candidates.** Anything `fn(&mut Frame/Buffer, Rect, &Data)`
   with no I/O is deterministic, widget libraries especially (one repo had 6 pure render fns
   with zero coverage while `insta` sat unused in dev-deps).
4. **Smoke tests are not coverage.** Panic-smoke (`terminal.draw(..).unwrap()`) proves it
   doesn't crash, not that it renders right. Fine as a floor, not as the test suite.
5. **A declared snapshot dep is not snapshot testing.** Check `rg 'insta::'` before believing
   a repo snapshot-tests; wire `insta::assert_snapshot!` to a buffer-to-string dump or drop
   the dep.

## What to Test, Minimum Set

- each screen/widget render fn at a fixed size (exact `assert_buffer_lines`)
- selection/scroll behavior: select past the end, empty list, `scroll_padding` window edges
- modal/toast paths WITH populated state
- resize behavior for layouts with `Fill`/`Min` (render at 2-3 sizes)
- to prove state (scroll/selection) survives a live resize on one running `Terminal`, not just
  fresh renders at each size: drive `backend.resize(w, h)` then `terminal.autoresize()` on the
  same instance (api-reference.md §§4-5, `TestBackend`/`Terminal`)
- event→state transitions (pure, no backend needed at all)

Keyboard-driving a full app loop in tests: feed synthetic `crossterm::event::Event`s into the
same handler the loop uses; never spawn a real terminal in CI.
