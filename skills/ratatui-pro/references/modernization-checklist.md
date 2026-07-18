# ratatui modernization checklist — hand-rolled → built-in

Current stable: **ratatui 0.30.2** (verify with the updater skill if months have passed).
Every row below is something a pre-0.29-trained model reimplements by hand that the library
now provides. Frequency column = how many of our 6 audited TUIs hand-rolled it in the 2026-07
audit (several TUIs hand-rolled it each time). Exact signatures live in `api-reference.md`;
check there before writing code.

## tier 1 — check these on every TUI touch

| hand-rolled | use instead | freq |
|---|---|---|
| `enable_raw_mode()` + `EnterAlternateScreen` + panic hook + restore, RAII guards | `ratatui::init()` / `try_init()` / `run(\|t\| ...)` / `restore()` — init installs the panic hook for you | 4/6 (two shipped WITHOUT a panic hook = terminal corruption on panic) |
| `Terminal<CrosstermBackend<Stdout>>` typedef | `ratatui::DefaultTerminal` | 4/6 |
| `layout.split(area)` + `chunks[0]`, `chunks[1]` indexing | `let [a, b] = Layout::vertical([...]).areas(area);` — fixed-N destructure; keep `.split()` only for runtime-variable N | 5/6 |
| `Constraint::Min(0)` to make a region grow | `Constraint::Fill(1)` | 4/6 |
| `Style::default().fg(c).add_modifier(Modifier::BOLD)` chains | `Stylize` shorthand: `"text".red().bold()`, `style.bold().underlined()` — works on `&str`, `Span`, `Line`, `Style`, widgets | 6/6 (20-180 sites per repo) |
| `Block::default().borders(Borders::ALL)` | `Block::bordered()` | 4/6 |
| manual popup/overlay centering math (`x + (w - pw)/2`) | `area.centered(Constraint, Constraint)` / `centered_horizontally` / `centered_vertically`, or `Layout::…flex(Flex::Center)` | 5/6 |
| hand-computed scrollbar thumb size/position + cell writes | `Scrollbar` + `ScrollbarState` | 4/6 |
| "keep selection visible" viewport offset math | `List` + `ListState` (`select_next/previous`, `scroll_padding(n)`) | 4/6 |
| buffer→String + `.contains()` assertions in tests | `TestBackend` + `assert_buffer_lines([...])` / `terminal.backend().assert_buffer(..)` | 5/6 → `testing.md` |

## tier 2 — situational, still commonly missed

| hand-rolled | use instead |
|---|---|
| `"•".repeat(len)` password masking | `Masked::new(secret, '•')` |
| manual `Rect { x: x+m, width: w-2m, .. }` margin math | `block.inner(area)` (handles borders + padding) or `area.inner(Margin::new(h, v))` |
| adjacent panels each drawing their own border (doubled seams) | `Block::merge_borders(MergeStrategy)` |
| hand-painted drop shadows | `Block::shadow(Shadow::dark_shade()...)` — presets + custom symbols/effects |
| custom table renderer (header + rule + per-cell colors + row highlight) | `Table` + `TableState` — `row_highlight_style` paints full rows; column/cell selection is built in (`select_column`, `select_cell`) |
| custom tab strip | `Tabs::new().select(i).highlight_style(..)` |
| block-glyph progress bar owning its own `Rect` | `Gauge` (block) / `LineGauge` (single line, `filled_style`/`unfilled_style`) |
| hand-written eighth-block glyph arrays (`▏▎▍…`) | `symbols::bar::NINE_LEVELS` / `symbols::block::NINE_LEVELS` |
| custom plotting/graphing | `Chart`, `Sparkline`, `BarChart`; `Canvas` with `Marker::{Quadrant, Sextant, Octant}` for high density |
| `Line { spans: vec![...] }` / `Span { content, style }` struct literals | `Line::from(..)`, `Span::raw/styled`, `"s".into()`, or `line!`/`span!`/`text!` macros (feature `macros`) |
| summing `span.content.chars().count()` for width | `Span::width()` / `Line::width()` (unicode-aware) |
| splitting `"a\nb"` yourself for `Text` | `Text::from("a\nb")` auto-splits |
| centering/aligning a title | `Line::from("t").centered()` + `Block::title_top/title_bottom` |
| repeated-symbol background fill | `Fill::new("░")` |
| wiping cells behind a modal | `frame.render_widget(Clear, area)` before the popup |
| iterating a `Rect`'s cells | `rect.positions()` / `rect.rows()` / `rect.columns()` |
| manual vertical scroll via offscreen buffer + blit | `Paragraph::scroll((y, x))` — note the tuple is (y, x), not (x, y) |
| counting wrapped lines by estimate | `Paragraph::line_count(width)` / `line_width()` — feature `unstable-rendered-line-info`, NOT default |
| `impl WidgetRef` to render without consuming | `impl Widget for &MyWidget` (0.30 target; `WidgetRef` is gated + on the way out) |
| cloning a widget every frame to satisfy `render(self)` | same — render via `&T` |
| building `Constraint` vecs in a loop | `Constraint::from_lengths/from_fills/from_percentages/..` |
| equal-split loop with hand-distributed remainder | `Layout::vertical(vec![Constraint::Fill(1); n])` |

## cargo features — audit findings

| flag | note |
|---|---|
| `layout-cache` | **default feature; `default-features = false` silently drops it** — 2/6 repos lost the layout solver cache this way. Re-add it to the features list whenever defaults are off. |
| `macros` | `line!`, `span!`, `text!`, `row!`, `constraints!`, `vertical!`/`horizontal!`. Enable only if used (1 repo shipped it unused). |
| `all-widgets` | pulls `widget-calendar` + `time` crate; drop it if Calendar is unused. |
| `underline-color` | default; needed for underline color styling on crossterm. |
| `unstable-rendered-line-info` | gates `Paragraph::line_count`/`line_width`; unstable = semver-exempt. |
| crate split (0.30) | depend ONLY on the `ratatui` umbrella; never on `ratatui-core`/`-widgets` directly. |

## hunt patterns

Run these to find offenses fast (`rg` over `src/`):

```
rg 'enable_raw_mode|EnterAlternateScreen'          # lifecycle → ratatui::init
rg '\.split\(' --type rust                         # candidates for .areas::<N>()
rg 'Constraint::Min\(0\)'                          # → Fill(1)
rg 'Style::(default|new)\(\)\.fg'                  # → Stylize (triage: theme modules may be fine)
rg 'add_modifier\(Modifier'                        # → .bold()/.italic()/...
rg 'Block::(default|new)\(\)\.borders'             # → Block::bordered()
rg 'saturating_sub\(.*\)\s*/\s*2'                  # manual centering math
rg '\.repeat\(' --type rust                        # masking / fills / bars candidates
rg 'WidgetRef'                                     # → impl Widget for &T
rg 'default-features\s*=\s*false' Cargo.toml       # check layout-cache survived
```

`Style::default().fg(...)` inside a central theme module is usually fine (semantic color
accessors); the offense is verbose chains at call sites.
