# ratatui patterns + gotchas (0.30-corrected cookbook)

Salvaged from pre-0.30 guides, corrected against the 0.30 API reference. Everything here
compiles on 0.30.x; the source guides also taught since-removed APIs (`widgets::block::Title`,
`Position`) and at least one fabricated method (`if_then_else` on `Stylize`) — those are gone.

## layout

- Solver is cassowary: over-constrained layouts resolve "best effort", may be non-obvious.
  Fix conflicts by intent: fixed elements `Length`, one grower `Fill(1)`.
- Classic conflict: `[Length(20), Percentage(100)]` — the percentage fights the fixed column.
  Use `[Length(20), Fill(1)]`.
- `Layout::init_cache(NonZeroUsize)` — takes `NonZeroUsize`, not a bare int (changed post-0.26).
- `Flex` variants: `Start, End, Center, SpaceBetween, SpaceEvenly, SpaceAround, Legacy`.
- Layouts are unit-testable: `Layout::vertical([...]).areas(Rect::new(0,0,w,h))` is pure.

## style

- `remove_modifier(BOLD)` right after `add_modifier(BOLD)` just cancels it; `sub_modifier(BOLD)`
  means "never bold, even after future patches". Use `sub_modifier` for suppression that must
  survive `.patch()`.
- `style_a.patch(style_b)`: b's set fields win, a's fill the gaps — the composition primitive
  for theme + state overrides (focused/pressed).
- Palettes: `ratatui::style::palette::{tailwind, material}` ship graded color scales — reach
  for them before inventing hex ramps.
- Themes serialize: `Style` and `Color` are serde-ready (feature `serde`) for config-file themes.

## text composition

Conversion chains (all real, all `Into`):

```rust
let span: Span = "text".into();
let line: Line = Span::raw("text").into();
let line: Line = vec!["Hello ".into(), "World".red()].into();
let text: Text = Line::from("text").into();
let text: Text = vec![Line::from("1"), Line::from("2")].into();
```

- Span = one styled fragment; Line = one row of spans; Text = rows. Pick the smallest that fits.
- Conditional styling is a plain `if`: `if ok { s.green() } else { s.red() }` — there is no
  combinator method for it.

## paragraph

- `Paragraph::scroll((y, x))` — **(y, x), the reverse of the (x, y) convention elsewhere.**
- Auto-scroll-to-bottom: `scroll((total_lines.saturating_sub(visible) as u16, 0))`.
- Don't wrap single-line content in `Paragraph` when a `Line` render does — `Line` is cheaper.
- Wrapped-line count: `line_count(width)` exists behind `unstable-rendered-line-info` (not
  default, semver-exempt). Without the feature, estimating is genuinely on you.

## stateful widgets

- Selection state outlives the frame: keep `ListState`/`TableState` in app state, pass
  `&mut` at render.
- `TableState` does rows AND columns/cells: `select_column`, `select_cell`,
  `scroll_right_by/left_by` — column selection needs no custom tracking (pre-0.29 advice
  claiming otherwise is obsolete).
- Pagination on top of `ListState`: `page = selected / page_size`; jump pages by selecting
  `page_start` — selection drives the view, not a separate offset.
- Bounds-check on data change: a filtered/shrunk list can leave `selected >= len`; clamp or
  `select_next`-style wrap.

## block

- Focused-widget border pattern:

```rust
fn focused_block(focused: bool) -> Block<'static> {
    Block::bordered()
        .border_type(if focused { BorderType::Thick } else { BorderType::Plain })
        .border_style(if focused { Style::new().cyan() } else { Style::new().gray() })
}
```

- Titles are `Line`s: `Block::bordered().title_top(Line::from("t").centered())` — the old
  `widgets::block::Title` struct + `Position` enum are removed.
- Border joining between adjacent blocks is `merge_borders(MergeStrategy)`, not shared-edge
  symbol tricks.

## canvas

Use `Canvas` for arbitrary-coordinate drawing: plots, particles, games, custom shapes
(impl the `Shape` trait). Prefer plain widgets when a grid fits — canvas costs coordinate
mapping. High-density markers: `Marker::{Quadrant, Sextant, Octant}`; `FilledLine` shape and
`Canvas::background_color()` exist in 0.30.

## data-viz widget choice

- `BarChart` — discrete category comparison, labeled values; `vertical/horizontal/grouped`
  constructors in 0.30; `SparklineBar: From<Option<u64>>` models absent samples
  (`absent_value_style/symbol`).
- `Sparkline` — trend in minimal space (0-anchored magnitude).
- `Gauge`/`LineGauge` — single progress value; `LineGauge` styles via `filled_style`/
  `unfilled_style` (no generic `.style()`).
- `Chart` — axes, multiple `Dataset`s, legend.
- `Gauge::percent(n)` takes `u16` 0–100; ratio is `Gauge::ratio(f64)`.

## third-party crate: ratatui-image

- `Picker::from_query_stdio()` probes terminal graphics capabilities over stdio termios — call it
  AFTER raw-mode init (`ratatui::init()` / `enable_raw_mode()`), never before. Before raw mode it
  saves/restores COOKED termios internally, which silently kills all keyboard input for the rest
  of the session (no panic, no error — just a dead app).
- Default features pull in `libchafa`, a system C lib, for the chafa protocol. To stay pure-Rust:
  `default-features = false, features = ["crossterm"]` + a jpeg/png-only decode dep (e.g. `image`
  with only the needed format features enabled) — no chafa dependency, no build-time system-lib
  requirement.
- **Protocol detection is conservatively wrong for whole terminal classes.** `from_query_stdio()`
  blacklists Kitty AND Sixel on any `KONSOLE_VERSION` session (konsole's sixel is buggy; neither
  implements kitty placeholders), then reaches iTerm2 only through a `TERM_PROGRAM` allowlist
  konsole isn't on, so every konsole session silently floors at `Halfblocks`, though konsole has
  spoken the iTerm2 inline-image protocol (`1337;File=`) since 22.04. Verified
  against konsole 26.07 + ratatui-image 11.0.6 (`picker.rs`), 2026-07. Raise the floor after
  querying, gated on the fallback so a detected protocol always wins and the workaround retires
  itself when upstream lifts the blacklist:

```rust
let mut picker = Picker::from_query_stdio().unwrap_or_else(|_| Picker::halfblocks());
if picker.protocol_type() == ProtocolType::Halfblocks
    && env::var("KONSOLE_VERSION").is_ok_and(|v| !v.is_empty())
{
    picker.set_protocol_type(ProtocolType::Iterm2);
}
```

  Generalizes past this one crate: a "renders badly" symptom reads as a layout/sizing bug, and can
  survive a whole feature's life that way. Probe the raw escape at the real tty first —
  `printf '\033]1337;File=inline=1;width=16;size=%d:%s\a' "$bytes" "$(base64 -w0 img.jpg)"` — and
  believe that over the library's verdict. Not runnable through tmux (passthrough eats it) or any
  non-tty stdout: it needs the user's own terminal.
- **`Resize::Fit` anchors top-left and never upscales.** An image handed a fixed `Rect` letterboxes
  against whichever edges it doesn't fill, and the widget takes no right/center option. Ask the
  protocol what it will occupy, then build the rect yourself:
  `protocol.size_for(Resize::Fit(None), Size::new(w, h))` returns fitted CELLS, accounts for the
  terminal's font aspect, and caps at the source's natural size (`min(available, image.width())`), so
  a small source stays small no matter how much room it's offered. A right-aligned rect is then
  `x: area.right() - fitted.width`. Corollary for sizing an image column beside text: cap the
  image's allowance at what the text's width floor spares, and the fitted rect can never starve the
  text, so one gate does the work instead of two that drift apart.
- Cover/thumbnail asset aspect drives the layout, not the reverse. A column beside text wants a
  square-ish source; a wide crop can only fill it by shrinking to a sliver. Check the CDN's variants
  before picking one (osu!: `list@2x` 300x300 is square, `card@2x` 2.9:1, `cover@2x` 3.6:1,
  `slimcover@2x` 5.3:1).
