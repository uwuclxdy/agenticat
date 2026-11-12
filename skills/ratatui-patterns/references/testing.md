# Testing Ratatui TUIs

Load when writing or reviewing TUI tests.
Non-trivial render logic ships with tests that fail if the logic breaks (repo rule).

## The Core Pattern: TestBackend

```rust
use ratatui::{Terminal, backend::TestBackend, widgets::{Block, Paragraph}};

#[test]
fn renders_header() {
    let mut terminal = Terminal::new(TestBackend::new(12, 3)).unwrap();
    let header = Paragraph::new("ok").block(Block::bordered().title("status"));
    terminal.draw(|f| f.render_widget(header, f.area())).unwrap();
    terminal.backend().assert_buffer_lines([
        "┌status────┐", // exact, one string per row
        "│ok        │",
        "└──────────┘",
    ]);
}
```

- `assert_buffer_lines([...])` is the primary assertion: exact rows, catches layout drift.
- `TestBackend::assert_buffer(&Buffer)` for comparing against a constructed `Buffer` (e.g. `Buffer::with_lines(..)` then `buf.set_style(..)` when styles matter).
- Both compare whole cells, symbol AND style: plain string rows fail on any rendered color or modifier. Style-aware rows: styled `Line`s, or the expected `Buffer` above.
- `TestBackend` errors are `Infallible` (0.30): `.unwrap()` them; no test helper returns `io::Error`.
- One widget needs no terminal: render into `Buffer::empty(area)`, then `assert_eq!(buf, Buffer::with_lines([..]))`. Equality includes the area: rows must match its size.
- Layout tests: render a letter into each chunk of a `Buffer` and compare with `Buffer::with_lines([..])`, not raw `Rect` lists.
- Scrollback: `assert_scrollback_lines([..])` / `assert_scrollback_empty()`.
- `TestBackend` covers rendering only: no event loop, keys or teardown. `insta` snapshots hold no colors; accept changes with `cargo insta review`, never by editing `.snap`.
- PTY tests (`termlens`): `terminal.wait_until(|screen| screen.contains(..))` for content, `terminal.wait_idle(..)` before a whole-screen snapshot; never a fixed sleep.

## Audit-Driven Rules (What Our Repos Got Wrong)

1. **No buffer→String + `.contains()` assertions.** 5/6 repos hand-rolled buffer flattening with substring checks: misses layout regressions, duplicates helper code per test file. Use `assert_buffer_lines`; if only a fragment is stable, one SHARED flatten helper per repo.
2. **Exercise the state, not just the happy path.** A render fn tested only through app-level draws with default state can have zero real coverage: one repo ran `render_overlays` in every test with toasts/modals always empty, so that code never executed. Construct fixtures that populate the state the branch needs.
3. **Pure render fns are unit-test candidates.** Anything `fn(&mut Frame/Buffer, Rect, &Data)` with no I/O is deterministic, widget libraries especially (one repo: 6 pure render fns, zero coverage, `insta` unused in dev-deps).
4. **Smoke tests are not coverage.** Panic-smoke (`terminal.draw(..).unwrap()`) proves it doesn't crash, not that it renders right. Fine as a floor, not as the test suite.
5. **A declared snapshot dep is not snapshot testing.** Check `rg 'insta::'` before believing a repo snapshot-tests; wire `insta::assert_snapshot!` to a buffer-to-string dump or drop the dep.

## What to Test, Minimum Set

- each screen/widget render fn at a fixed size (exact `assert_buffer_lines`)
- selection/scroll behavior: select past the end, empty list, `scroll_padding` window edges
- modal/toast paths WITH populated state
- resize behavior for layouts with `Fill`/`Min` (render at 2-3 sizes)
- state (scroll/selection) surviving a live resize on one running `Terminal`, not fresh renders per size: `terminal.backend_mut().resize(w, h)` then `terminal.autoresize().unwrap()`
- event→state transitions (pure, no backend needed at all)

Keyboard-driving a full app loop in tests: feed synthetic `ratatui::crossterm::event::Event`s into the same handler the loop uses; never drive a real terminal emulator in CI (a `termlens` PTY test is not one).

A run loop meant to run on `TestBackend` is generic: `fn run_app<B: Backend>(terminal: &mut Terminal<B>) -> Result<(), Box<dyn Error>> where B::Error: 'static`. Never `-> io::Result<..>` with `io::Error: From<B::Error>`: `TestBackend`'s error is `Infallible`, which `io::Error` does not convert from.

## Diff Checklist

- Each changed render fn has an exact-match test at a fixed size, with fixtures populating its state.
- No `.contains()` on a flattened `Buffer`; no test drives a real terminal emulator (a `termlens` PTY test is fine).
