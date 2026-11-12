---
name: ratatui-patterns
description: "Modern-ratatui knowledge pack for Rust TUI code on ratatui and crossterm."
when_to_use: "Use when touching TUI widgets, layout, styling, or event loops, writing TestBackend render tests, or resolving ratatui upgrades."
metadata:
  author: uwuclxdy
  version: "1.8"
---

# Ratatui Patterns

Current stable: **ratatui 0.30.2** (2026-06), on Rust 1.88+ and crossterm 0.29. Model training data predates 0.29. The biggest failure mode is reimplementing by hand what the library now provides; the second is asserting API shapes from memory. Both have the same fix: **work from the bundled references, not from memory.**

## Hard Rules

1. Before writing any TUI render/layout/lifecycle code, read `references/modernization-checklist.md`. If the thing being built appears in it, use the built-in; if the form is in its removed-or-renamed table, type the current one.
2. Before claiming an API exists or writing a signature, verify it in `references/api-reference.md` (grep-friendly). If it is not there and not in `references/limitations.md`, pull live docs (below) before hand-rolling.
3. Use a built-in unless it cannot meet a measured, approved rendering invariant; record that gap beside the custom renderer. Anything else custom is a defect.
4. Render logic ships with `TestBackend` tests per `references/testing.md`.
5. An application depends only on the `ratatui` umbrella crate, never on `ratatui-core`/`-widgets`; a widget library depends on `ratatui-core = "0.1"`, never `"0.30"`. If `default-features = false`, re-add `layout-cache`.
6. Mouse events are opt-in. `ratatui::init()`/`run()` do not enable mouse capture; that needs `EnableMouseCapture`/`DisableMouseCapture` around the loop (`references/api-reference.md`, events).
7. The event loop can go async (`crossterm`'s `event-stream` feature + `EventStream` for `tokio::select!`); `Terminal::draw` stays sync regardless (`references/api-reference.md`, events).
8. Call `terminal.draw` once per pass and render the whole UI inside it. Each pass starts from an empty buffer: a widget left out disappears.
9. Act on a key event only when `key.kind == KeyEventKind::Press`. Windows also sends the release.
10. Builder setters consume `self`: chain or rebind. A bare `list.block(b);` changes nothing. `unused_must_use`
11. Widget state (`ListState`, `TableState`) lives in app state, passed as `frame.render_stateful_widget(w, area, &mut state)`. Built in the draw closure it resets every frame.

## Files

| file | when to read |
|---|---|
| `references/modernization-checklist.md` | always, first: hand-rolled → built-in map, removed/renamed API, hunt greps |
| `references/api-reference.md` | exact signatures, feature flags, widget/API surface, events (mouse capture, sync vs async loop, kitty key flags) |
| `references/limitations.md` | before writing custom render code; design-system conformance limits |
| `references/testing.md` | writing or reviewing TUI tests |
| `references/patterns.md` | loop skeleton, composition idioms, corrected cookbook, widget choice |
| `references/app-loop.md` | app structure: manual setup + panic hook, input thread or tokio task, `Action`/`update`, draw errors, child processes, logging |
| `references/audit-prompt.md` | fanning out per-repo modernization audits |

## Live Docs, on Demand

For anything the bundled references don't answer 1:1, fetch instead of guessing:

- API detail: `https://docs.rs/ratatui/latest/ratatui/` (append module path, e.g. `widgets/struct.Table.html`)
- release highlights: `https://ratatui.rs/highlights/v0302/` (version digits, no dots)
- breaking changes: `https://raw.githubusercontent.com/ratatui/ratatui/main/BREAKING-CHANGES.md`
- concepts/recipes: `https://ratatui.rs/concepts/` and `https://ratatui.rs/recipes/`
- version check: `curl -s -H 'User-Agent: ratatui-version-check' https://crates.io/api/v1/crates/ratatui` (a bare curl without User-Agent gets policy-blocked)

If crates.io reports a version newer than the one at the top of this file, flag it before trusting the bundled references.

## Related

- design language (colors, spacing, motion grammar): the project's design-language skill, if it has one. That skill says WHAT it should look like; this one says WHICH ratatui API renders it.
- panic-safe teardown: `ratatui::init()` installs the restore panic hook; install yours before it. Hand-roll guards for other seams (bracketed paste, kitty flags, signals). Kitty flags tell Shift+Enter/Ctrl+Enter apart from plain Enter (`references/api-reference.md`, events).
