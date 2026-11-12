# Ratatui Patterns + Gotchas (0.30-Corrected Cookbook)

Load when composing a screen, an event loop or a custom widget, or when output is wrong with no compile error.
Everything here compiles on 0.30.x.

## App Loop

```rust
use ratatui::crossterm::event::{self, Event, KeyCode, KeyEventKind, KeyModifiers};
use ratatui::{DefaultTerminal, widgets::{HighlightSpacing, List, ListState}};

fn main() -> std::io::Result<()> {
    ratatui::run(app) // init + panic hook, restores on Ok and Err
}

fn app(terminal: &mut DefaultTerminal) -> std::io::Result<()> {
    let mut state = ListState::default(); // outlives the frame
    loop {
        terminal.draw(|frame| { // once per pass, the whole UI
            let list = List::new(["a", "b"]).highlight_symbol("> ").highlight_spacing(HighlightSpacing::Always);
            frame.render_stateful_widget(list, frame.area(), &mut state);
        })?;
        match event::read()? {
            Event::Key(key) if key.kind == KeyEventKind::Press => match key.code {
                KeyCode::Char('q') => return Ok(()),
                // raw mode: Ctrl-C is a key event, not SIGINT
                KeyCode::Char('c') if key.modifiers.contains(KeyModifiers::CONTROL) => return Ok(()),
                KeyCode::Down => state.select_next(),
                _ => {}
            },
            _ => {}
        }
    }
}
```

- With `ratatui::init()` instead of `run`: `let result = app(&mut terminal); ratatui::restore(); result`. A `?` before `restore()` leaves the terminal raw.
- Input thread, async, manual setup, app structure: `app-loop.md`.

## Layout

- Solver is Cassowary (the `kasuari` crate in 0.30): over-constrained layouts resolve "best effort", may be non-obvious. Fix conflicts by intent: fixed elements `Constraint::Length`, one grower `Constraint::Fill(1)`.
- Conflicts resolve by type, never array order: `Min` > `Max` > `Length` > `Percentage` > `Ratio` > `Fill`.
- `Percentage`/`Ratio` are shares of the whole area, not of what is left. Classic conflict: `[Constraint::Length(20), Constraint::Percentage(100)]`, the percentage fights the fixed column. Use `[Constraint::Length(20), Constraint::Fill(1)]`.
- `Layout::horizontal` puts segments side by side; `Layout::vertical` stacks them.
- `Flex` variants: `Start, End, Center, SpaceBetween, SpaceEvenly, SpaceAround, Legacy`. Default is `Start` (0.26+): an all-`Length` layout no longer stretches its last area (`Legacy` does). Since 0.30 equal gaps are `SpaceEvenly`, not `SpaceAround`.
- Screen y grows downward from `(0, 0)` top-left. `rect.right()`/`rect.bottom()` are exclusive: loop `rect.left()..rect.right()`.
- Layouts are unit-testable: `let [a, b] = Layout::vertical([...]).areas(Rect::new(0,0,w,h));` is pure.
- The layout cache works without a call. `Layout::init_cache(NonZeroUsize::new(n).expect("n is nonzero"))` only sets a custom size, once before the first draw: it takes `NonZeroUsize`, not a bare int (0.28+), and exists only with the `layout-cache` feature (default; gated since 0.30).

## Style

- `remove_modifier(Modifier::BOLD)` (shorthand `.not_bold()`) turns BOLD off and records the suppression, so it survives `.patch()`. `Style` has no `sub_modifier` method.
- `style_a.patch(style_b)`: b's set fields win, a's fill the gaps, modifiers merge. Use it for theme + state overrides (focused/pressed).
- On `Span`, `Line` and `Text`, `.style(s)` replaces the style; `.patch_style(s)` merges into it.
- Precedence: widget < `Text` < `Line` < `Span`. The narrower style patches on top: its set fields win.
- Palettes: `ratatui::style::palette::{tailwind, material}` ship graded color scales. Reach for them before inventing hex ramps.
- Themes serialize: `Style` and `Color` are serde-ready (feature `serde`) for config-file themes.

## Text Composition

Conversion chains (all real, all `Into`):

```rust
// fragment
use ratatui::style::Stylize;
let span: Span = "text".into();
let line: Line = Span::raw("text").into();
let line: Line = vec!["Hello ".into(), "World".red()].into();
let text: Text = Line::from("text").into();
let text: Text = vec![Line::from("1"), Line::from("2")].into();
```

- Span = one styled fragment; Line = one row of spans; Text = rows. Pick the smallest that fits.
- A `Line` is one row: a `\n` inside it never starts a new row. One `Line` per row, or `Text::from("a\nb")`.
- Conditional styling is a plain `if`: `if ok { s.green() } else { s.red() }`. `Stylize` has no `if_then_else`.

## Paragraph

- `Paragraph::scroll((y, x))`: **(y, x), not (x, y).**
- Long lines are cut at the area edge unless `.wrap(Wrap { trim: true })`. `.wrap(true)` and `Wrap::trim(..)` do not exist.
- Auto-scroll-to-bottom: `scroll((total_lines.saturating_sub(visible) as u16, 0))`.
- Don't wrap single-line content in `Paragraph` when a `Line` render suffices; `Line` is cheaper.

## Stateful Widgets

- Selection state outlives the frame: keep `ListState`/`TableState` in app state, pass `&mut` at render.
- With a `highlight_symbol`, set `.highlight_spacing(HighlightSpacing::Always)` on the `List`/`Table`: the default shifts rows when a selection appears.
- `TableState` does rows AND columns/cells (`select_column`, `select_cell`, `scroll_right_by/left_by`): column selection needs no custom tracking.
- Pagination on top of `ListState`: `let page = state.selected().unwrap_or(0) / page_size.max(1);`, then jump pages with `state.select(Some(page * page_size))`: selection drives the view, not a separate offset.
- Bounds-check on data change: a filtered/shrunk list leaves `selected >= len` until the next render clamps it. Before indexing data with it, clamp: `state.select(state.selected().filter(|_| len > 0).map(|i| i.min(len - 1)))`.

## Block

- Focused-widget border pattern:

```rust
use ratatui::style::Style;
use ratatui::widgets::{Block, BorderType};

fn focused_block(focused: bool) -> Block<'static> {
    Block::bordered()
        .border_type(if focused { BorderType::Thick } else { BorderType::Plain })
        .border_style(if focused { Style::new().cyan() } else { Style::new().gray() })
}
```

- Titles are `Line`s: `Block::bordered().title_top(Line::from("t").centered())`. The old `widgets::block::Title` struct is removed; the `block::Position` enum is now `widgets::TitlePosition`.
- Border a widget with `.block(Block::bordered())` on the widget itself. A block and its content rendered into the same area overlap at the border.
- `Padding::new(left, right, top, bottom)`: not the CSS order.

## Custom Widgets

- The trait method is `fn render(self, area: Rect, buf: &mut Buffer)`, on `impl Widget for &MyWidget`. `fn render(&self, f: &mut Frame)` does not exist.

## Canvas

Use `Canvas` for arbitrary-coordinate drawing: plots, particles, games, custom shapes (impl the `Shape` trait). Prefer plain widgets when a grid fits; canvas costs coordinate mapping. High-density markers: `Marker::{Quadrant, Sextant, Octant}`; `FilledLine` and `Canvas::background_color()` exist in 0.30.

- Canvas and chart coordinates are math-style `f64`: origin bottom-left, y grows upward. A canvas `Rectangle` sits on its bottom-left corner. Nothing draws without `.paint(|ctx| ctx.draw(&shape))`: shapes go in by reference.

## Data-Viz Widget Choice

- `BarChart`: discrete category comparison, labeled values; `vertical/horizontal/grouped` constructors in 0.30.
- `Sparkline`: trend in minimal space (0-anchored magnitude). Data takes `u64`, `Option<u64>` or `SparklineBar` (`From<Option<u64>>`); absent samples render with `absent_value_style`/`absent_value_symbol`.
- `Gauge`/`LineGauge`: single progress value; `LineGauge` styles the bar via `filled_style`/`unfilled_style`, and `.style()` covers everything except the bar.
- `Chart`: axes, multiple `Dataset`s, legend. Give both axes `.bounds([min, max])` covering the data (default `[0.0, 0.0]` plots nothing) and each `Dataset` a `.graph_type(GraphType::Line)` (default `Scatter` draws dots only).
- `Gauge::percent(n)` takes `u16` 0-100; ratio is `Gauge::ratio(f64)` 0.0-1.0. Both panic out of range.

## Third-Party Crate: ratatui-image

- Call `Picker::from_query_stdio()` after entering the alternate screen and before anything reads a terminal event (the loop's `event::read()`, an input thread, an `EventStream`): it writes and reads stdio momentarily. `ratatui::init()` and `run` enter the alternate screen, so call it right after init, before the loop.
- Default features pull in `libchafa`, a system C lib. To stay pure-Rust: `default-features = false, features = ["crossterm"]` + an `image` dep with only the needed format features.
- Probe failure: fall back with `Picker::from_query_stdio().unwrap_or_else(|_| Picker::halfblocks())` (`halfblocks()`: 9.0+). A terminal that does not answer already yields a halfblocks-capable picker (8.0.2+); the fallback catches the remaining `Err`, an I/O error.
- **Protocol detection is conservatively wrong for whole terminal classes.** `from_query_stdio()` blacklists Kitty and Sixel on any `KONSOLE_VERSION` session (konsole's sixel is buggy; neither implements kitty placeholders), then reaches iTerm2 only through an env allowlist (`TERM_PROGRAM`, `LC_TERMINAL`) konsole is not on. So konsole floors at `Halfblocks`, though it has spoken the iTerm2 inline-image protocol (`1337;File=`) since 22.04 (verified: konsole 26.07 + ratatui-image 11.0.6, 2026-07; still so in 11.1.0). Raise the floor after querying, gated on the fallback, so a detected protocol always wins:

```rust
use ratatui_image::picker::{Picker, ProtocolType};

let mut picker = Picker::from_query_stdio().unwrap_or_else(|_| Picker::halfblocks());
if picker.protocol_type() == ProtocolType::Halfblocks
    && std::env::var("KONSOLE_VERSION").is_ok_and(|v| !v.is_empty())
{
    picker.set_protocol_type(ProtocolType::Iterm2);
}
```

- A "renders badly" symptom reads as a layout bug. Probe the raw escape at the real tty first and believe it over the library: `printf '\033]1337;File=inline=1;width=16;size=%d:%s\a' "$bytes" "$(base64 -w0 img.jpg)"`. Tmux and non-tty stdout eat it.
- **`Resize::Fit` anchors top-left and never upscales**; there is no right/center option. Build the rect from `protocol.size_for(Resize::Fit(None), Size::new(w, h))`: fitted CELLS, font aspect applied, capped at the source's natural size. Right-align with `x: area.right() - fitted.width`. Beside text, cap the image at what the text's width floor spares.
- Asset aspect drives the layout: a column beside text wants a square-ish source. When the asset comes from a CDN or an image service, check its variant sizes before picking one.

## Diff Checklist

- One `terminal.draw` per pass, widget state built outside it, keys gated on `KeyEventKind::Press`, Ctrl-C quits, every setter chained or rebound.
- No `Percentage` beside `Length` meant as "the rest"; long `Paragraph` text has `.wrap(..)`.
