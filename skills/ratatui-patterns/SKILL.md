---
name: ratatui-patterns
description: "Modern-ratatui knowledge pack for writing, refactoring, or reviewing Rust TUI code on ratatui or crossterm. Use when touching TUI widgets, layout, styling, or event loops; writing TestBackend render tests; or resolving ratatui version upgrades and API questions."
metadata:
  author: uwuclxdy
  version: "1.2"
---

# Ratatui Patterns

Modern-ratatui knowledge pack. Current stable: **ratatui 0.30.2** (2026-06). Model training
data predates 0.29. The biggest failure mode is reimplementing by hand what the library now
provides; the second is asserting API shapes from memory. Both have the same fix: **work from
the bundled references, not from memory.**

## hard rules

1. Before writing any TUI render/layout/lifecycle code, read
   `references/modernization-checklist.md`. If the thing being built appears in it, use the
   built-in.
2. Before claiming an API exists or writing a signature, verify it in
   `references/api-reference.md` (generated from ratatui source, grep-friendly). If it is not
   there and not in `references/limitations.md`, pull live docs (below) before hand-rolling.
3. Custom render code is allowed only for needs listed in `references/limitations.md` (the
   verified beyond-API catalog). Anything else custom is a defect.
4. Render logic ships with `TestBackend` tests per `references/testing.md`.
5. Depend only on the `ratatui` umbrella crate, never on `ratatui-core`/`-widgets` directly.
   If `default-features = false`, re-add `layout-cache`.
6. Mouse events are opt-in. `ratatui::init()`/`run()` do not enable mouse capture; that needs
   `EnableMouseCapture`/`DisableMouseCapture` around the loop (`references/api-reference.md` §14).
7. The event loop can go async (`crossterm`'s `event-stream` feature + `EventStream` for
   `tokio::select!`); `Terminal::draw` stays sync regardless (`references/api-reference.md` §14).

## files

| file | when to read |
|---|---|
| `references/modernization-checklist.md` | always, first — hand-rolled → built-in map + hunt greps |
| `references/api-reference.md` | exact signatures, feature flags, full widget/API surface, events (mouse capture, sync vs async loop, kitty key flags) |
| `references/limitations.md` | before writing custom render code; design-system conformance limits |
| `references/testing.md` | writing or reviewing TUI tests |
| `references/patterns.md` | composition idioms, corrected cookbook, widget-choice guidance |
| `references/audit-prompt.md` | fanning out per-repo modernization audits |

## live docs, on demand

For anything the bundled references don't answer 1:1, fetch — don't guess:

- API detail: `https://docs.rs/ratatui/latest/ratatui/` (append module path, e.g.
  `widgets/struct.Table.html`)
- release highlights: `https://ratatui.rs/highlights/v0302/` (version digits, no dots)
- breaking changes: `https://raw.githubusercontent.com/ratatui/ratatui/main/BREAKING-CHANGES.md`
- concepts/recipes: `https://ratatui.rs/concepts/` and `https://ratatui.rs/recipes/`
- version check: `curl -s -H 'User-Agent: ratatui-version-check' https://crates.io/api/v1/crates/ratatui`
  (a bare curl without User-Agent gets policy-blocked)

If crates.io reports a version newer than the one at the top of this file, flag it and run the
`ratatui-pro-update` skill before trusting the bundled references.

## related

- design language (colors, spacing, motion grammar): the project's design-language skill, if it
  has one. That skill says WHAT it should look like; this one says WHICH ratatui API renders it.
- panic-safe teardown + shimmer recipe: under 0.30, `ratatui::init()` already installs the
  restore panic hook; hand-rolled guards are only for extra seams like bracketed paste or kitty
  flags. Kitty flags are what let you tell Shift+Enter/Ctrl+Enter apart from plain Enter, see
  `references/api-reference.md` §14.
- per-repo modernization punch-lists from the 2026-07 audit: `<repo>/docs/ratatui-modernization.md`
  across several real TUIs.
