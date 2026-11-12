# Ratatui Modernization Checklist: Hand-Rolled → Built-In

Load before writing or reviewing ratatui render, layout or lifecycle code, and when an upgrade breaks the build.
Current stable: **ratatui 0.30.2**. Every row is something a pre-0.29-trained model types from memory that the library now provides or replaced. Freq = how many of 6 audited TUIs hand-rolled it (2026-07 audit). Exact signatures live in `api-reference.md`; check there before writing code.

## Removed or Renamed: Type the Current Form

`error` rows no longer build; `warn` rows build under the `deprecated` lint.

| stale | current | since |
|---|---|---|
| `tui = "0.19"`, `use tui::..` | `ratatui = "0.30"`, `use ratatui::..`: `tui` is the unmaintained original | crate rename |
| `Spans`, `buf.set_spans(..)` | `Line`, `buf.set_line(x, y, &line, width)` | 0.24 error |
| `fn ui<B: Backend>(f: &mut Frame<B>)` | `fn ui(frame: &mut Frame)` | 0.24 error |
| `use ratatui::terminal::{Frame, ViewPort}` | `use ratatui::{Frame, Terminal, Viewport}` | 0.28 error |
| `frame.size()` | `frame.area()` | 0.28 warn |
| `Table::new(rows).widths(&[..])` | `Table::new(rows, [..])`: widths are the 2nd argument | 0.25 error |
| `list.start_corner(Corner::..)`, `layout::Corner` | `list.direction(ListDirection::..)` | 0.27 error |
| `List::new(vec![])`, `Table::new(vec![], widths)`, `Tabs::new(iter.collect())` | `List::default()`, `Table::default()`, `Tabs::new(iter)` | 0.25 error (`Table`, `Tabs`: 0.26) |
| `match marker` naming every variant | add a `_ =>` arm: `Marker` is `#[non_exhaustive]` | 0.30 error |
| `block::Title`, `.title_on_bottom()`, `block::Position` | `.title_top(line)`/`.title_bottom(line)`; enum renamed `TitlePosition` | 0.30 error (`title_on_bottom`: 0.26) |
| `Padding::zero()` | `Padding::ZERO` | warn |

## Tier 1: Check These on Every TUI Touch

| hand-rolled | use instead | freq |
|---|---|---|
| `enable_raw_mode()` + `EnterAlternateScreen` + panic hook + restore, RAII guards | `ratatui::{init, try_init, restore}` or `ratatui::run(\|t\| ...)`: init installs the panic hook | 4/6 (two shipped WITHOUT a panic hook = terminal corruption on panic) |
| `Terminal<CrosstermBackend<Stdout>>` typedef | `ratatui::DefaultTerminal` | 4/6 |
| `layout.split(area)` + `chunks[0]`, `chunks[1]` indexing | `let [a, b] = Layout::vertical([...]).areas(area);`: fixed-N destructure; keep `.split()` only for runtime-variable N | 5/6 |
| `Constraint::Min(0)` to make a region grow | `Constraint::Fill(1)` | 4/6 |
| `Style::default().fg(c).add_modifier(Modifier::BOLD)` chains | `Stylize` shorthand (`use ratatui::style::Stylize`, never crossterm's): `"text".red().bold()`: works on `&str`, `Span`, `Line`, widgets. `Style` has the same shorthands as its own methods since 0.30 (`Style::new().bold().underlined()`): no `Stylize` import for them | 6/6 (20-180 sites per repo) |
| `Block::default().borders(Borders::ALL)` | `Block::bordered()` | 4/6 |
| manual popup/overlay centering math (`x + (w - pw)/2`) | `area.centered(Constraint, Constraint)` / `centered_horizontally` / `centered_vertically`, or `Layout::vertical([Constraint::Length(h)]).flex(Flex::Center)` | 5/6 |
| hand-computed scrollbar thumb size/position + cell writes | `Scrollbar` + `ScrollbarState` | 4/6 |
| "keep selection visible" viewport offset math | `List` + `ListState` (`ListState::select_next/previous`, `List::scroll_padding(n)`) | 4/6 |
| buffer→String + `.contains()` assertions in tests | `TestBackend` + `assert_buffer_lines([...])` / `terminal.backend().assert_buffer(..)` | 5/6 → `testing.md` |

## Tier 2: Situational, Still Commonly Missed

| hand-rolled | use instead |
|---|---|
| `"•".repeat(len)` password masking | `Masked::new(secret, '•')` |
| manual `Rect { x: x+m, width: w-2m, .. }` margin math | `block.inner(area)` (handles borders + padding) or `area.inner(Margin::new(h, v))` |
| adjacent panels each drawing their own border (doubled seams) | `Block::merge_borders(MergeStrategy)` |
| hand-painted drop shadows | `Block::shadow(Shadow::dark_shade()...)`: presets + custom symbols/effects |
| custom table renderer (header + rule + per-cell colors + row highlight) | `Table` + `TableState`: `row_highlight_style` (not the deprecated `highlight_style`) paints full rows; column/cell selection is built in (`select_column`, `select_cell`) |
| custom tab strip | `Tabs::new(titles).select(i).highlight_style(..)`; default highlight is reversed video |
| block-glyph progress bar owning its own `Rect` | `Gauge` (block) / `LineGauge` (single line, `filled_style`/`unfilled_style`; `LineGauge::gauge_style` is deprecated) |
| hand-written eighth-block glyph arrays (`▏▎▍…`) | `symbols::bar::NINE_LEVELS` / `symbols::block::NINE_LEVELS` |
| custom plotting/graphing | `Chart`, `Sparkline`, `BarChart`; `Canvas` with `Marker::{Quadrant, Sextant, Octant}` for high density |
| `Line { spans: vec![...] }` / `Span { content, style }` struct literals | `Line::from(..)`, `Span::raw/styled`, `"s".into()`, or `line!`/`span!`/`text!` macros (feature `macros`) |
| summing `span.content.chars().count()` for width | `Span::width()` / `Line::width()` (unicode-aware) |
| splitting `"a\nb"` yourself for `Text` | `Text::from("a\nb")` auto-splits |
| centering/aligning a title | `Line::from("t").centered()` + `Block::title_top/title_bottom` |
| repeated-symbol background fill | `Fill::new("░")` |
| wiping cells behind a modal | `frame.render_widget(Clear, area)` before the popup |
| iterating a `Rect`'s cells | `rect.positions()` / `rect.rows()` / `rect.columns()` |
| manual vertical scroll via offscreen buffer + blit | `Paragraph::scroll((y, x))`: (y, x), not (x, y) |
| counting wrapped lines by estimate | `Paragraph::line_count(width)` / `line_width()`: feature `unstable-rendered-line-info`, NOT default |
| `impl WidgetRef`, or cloning a widget every frame to satisfy `render(self)` | `impl Widget for &MyWidget`, then render `&widget` (0.30 target; `WidgetRef` is gated + on the way out) |
| building `Constraint` vecs in a loop | `Constraint::from_lengths/from_fills/from_percentages/..` |
| equal-split loop with hand-distributed remainder | `Layout::vertical(vec![Constraint::Fill(1); n])` |

## Cargo Features: Audit Findings

| flag | note |
|---|---|
| `layout-cache` | **default feature; `default-features = false` silently drops it**: 2/6 repos lost the layout solver cache this way. Re-add it whenever defaults are off. |
| `macros` | `line!`, `span!`, `text!`, `row!`, `constraints!`, `vertical!`/`horizontal!`. Default feature; with defaults off, re-add it only if used (1 repo shipped it unused). |
| `all-widgets` | pulls `widget-calendar` + `time` crate; drop it if Calendar is unused. |
| `underline-color` | default; needed for underline color styling on crossterm. |
| `unstable-rendered-line-info` | gates `Paragraph::line_count`/`line_width`; unstable = semver-exempt. |
| crate split (0.30) | an app depends ONLY on the `ratatui` umbrella; a widget library depends on `ratatui-core = "0.1"` (`ratatui-widgets = "0.3"`), never `"0.30"`. |

## Hunt Patterns

Find offenses fast (`rg` over `src/`):

```
rg 'Spans|Frame<B>|\.size\(\)|block::Title' # removed or renamed
rg 'enable_raw_mode|EnterAlternateScreen' # lifecycle → ratatui::init
rg '\.split\(' --type rust # candidates for .areas::<N>()
rg 'Constraint::Min\(0\)' # → Fill(1)
rg 'Style::(default|new)\(\)\.fg' # → Style shorthands .red()/.bold(), no Stylize import (triage: theme modules may be fine)
rg 'add_modifier\(Modifier' # → .bold()/.italic()/...
rg 'Block::(default|new)\(\)\.borders' # → Block::bordered()
rg 'saturating_sub\(.*\)\s*/\s*2' # manual centering math
rg '\.repeat\(' --type rust # masking / fills / bars candidates
rg 'WidgetRef' # → impl Widget for &T
rg 'default-features\s*=\s*false' Cargo.toml # check layout-cache survived
```

## Diff Checklist

- No form from the removed-or-renamed table; no new `deprecated` warning.
- Each hand-rolled form with a row above uses its built-in.
- Each custom renderer kept names its gap from `limitations.md`.
- `Cargo.toml`: one crossterm major (`cargo tree -p crossterm`); `layout-cache` listed when defaults are off.
