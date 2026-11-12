# Ratatui 0.30.x: Public API Reference

Load this file before typing any ratatui type, method, import path, feature flag or macro: it lists what ratatui 0.30.2 ships.
A name that is not in this file is not written from memory: check the live docs first.

> Documented against release tag `ratatui-v0.30.2` (current stable, 2026-06-19); later API is not listed. **0.30.2** is a patch release that adds the Termina backend (`termina` feature, `TerminaBackend`, `ratatui::termina` re-export), requires shadow `CellEffect`s to be `Send + Sync`, and fixes wide-cell diffing and a scrollbar-thumb clamp. ratatui 0.30.1+ requires Rust 1.88 (0.30.0 required 1.86).
> Single source of truth for "what does ratatui give you out of the box". Grep-friendly.

Reading the lists: a block opening with `// fragment` is a signature list or partial snippet, not a program. A line starting with `.` is a builder setter (takes `self`, returns `Self`: chain it). `(..)` elides an argument: `impl Into<Style>` on a `*style` setter, otherwise the type shown on the setter before it. `WRONG` marks the stale or broken form, `RIGHT` the one to write.

Ratatui 0.30 is a **workspace split into crates**. The `ratatui` umbrella crate re-exports everything; each item below notes its origin crate.

| Crate | Role |
|---|---|
| `ratatui` | Umbrella: re-exports + `init`/`restore` helpers + `DefaultTerminal` + `WidgetRef`/`FrameExt` (feature `unstable-widget-ref`) |
| `ratatui-core` | `Terminal`, `Frame`, `Buffer`, `Cell`, `layout`, `style`, `text`, `symbols`, `Widget`/`StatefulWidget`, `Backend` trait, `TestBackend` |
| `ratatui-widgets` | All built-in widgets (`Block`, `Paragraph`, `List`, `Table`, `Chart`, `Canvas`, …) |
| `ratatui-crossterm` / `-termion` / `-termwiz` / `-termina` | `CrosstermBackend` (+ crossterm re-export + conversions), `TermionBackend`, `TermwizBackend`, `TerminaBackend` (0.30.2), each behind its feature |
| `ratatui-macros` | the macros of §13 (feature `macros`) |

## 1. Top-Level Re-Exports & Prelude

`use ratatui::...` exposes (umbrella `lib.rs`):

```rust
// fragment
// types at crate root
ratatui::{Frame, Terminal, TerminalOptions, Viewport, CompletedFrame};
ratatui::{buffer, layout, style, symbols, text, widgets, backend, prelude};
ratatui::{init, macros};  // modules behind features `crossterm` / `macros`
ratatui::border;  // macro: border!(TOP, LEFT) -> Borders
ratatui::palette;  // the `palette` crate, re-exported (feature `palette`)
ratatui::crossterm;  // the `crossterm` crate, re-exported (feature `crossterm`)
// init helpers at root (feature `crossterm`):
ratatui::{init, try_init, init_with_options, try_init_with_options, restore, try_restore, run, DefaultTerminal};
```

- Import the terminal types from the crate root. `ratatui::terminal` is private (0.28) and the type is `Viewport`, never `ViewPort`.

```rust
// fragment
use ratatui::terminal::{Frame, Terminal, ViewPort}; // WRONG: does not compile
use ratatui::{Frame, Terminal, Viewport};  // RIGHT
```

- An application depends on `ratatui` only: never `ratatui_core::..` or `ratatui_widgets::..` paths, never the `tui` crate.
- A widget library depends on `ratatui-core = "0.1"` (plus `ratatui-widgets = "0.3"` for built-in widgets): there is no `0.30` of either.

**Prelude**: `use ratatui::prelude::*;`. Officially de-emphasized (see Issue #1150) but kept for back-compat. It brings `Frame`, `Terminal`, `symbols`, `Backend` + `backend`, the enabled backend + its `From*`/`Into*` traits, `Buffer` + `buffer`, `layout::{Alignment, Constraint, Direction, HorizontalAlignment, Layout, Margin, Position, Rect, Size, VerticalAlignment}`, `style::{Color, Modifier, Style, Stylize}`, `text::{Line, Masked, Span, Text}`, `widgets::{BlockExt, StatefulWidget, Widget}`. Not in it: `Styled`, `Marker` (write `symbols::Marker`), `CompletedFrame`, `TerminalOptions`, `Viewport`.

> The modern idiom (0.30) is to import explicitly (`use ratatui::widgets::Paragraph;`) rather than glob the prelude.

`ratatui::widgets` exports every widget of §12 with its state and option types, the traits `Widget`, `StatefulWidget`, `BlockExt`, `FrameExt` (feature `unstable-widget-ref`), and the submodules `calendar` (feature `widget-calendar`) and `canvas`.

## 2. Feature Flags

Umbrella `default = ["all-widgets", "crossterm", "layout-cache", "macros", "underline-color"]`.

| Feature | Effect |
|---|---|
| `crossterm` (default) | `CrosstermBackend` + crossterm dep + `std` |
| `crossterm_0_28` / `crossterm_0_29` | pick the crossterm 0.28.x or 0.29.x backend (0.29 is the default) |
| `termion` / `termwiz` / `termina` | alternate backends; `termina` (new in 0.30.2) also adds the `ratatui::termina` re-export |
| `std` | enable std (implied by any backend); a `no_std` build (0.30) sets `default-features = false` and enables no backend |
| `serde` | (de)serialize style/color types: save themes to file |
| `layout-cache` (default) | cache layout solver results |
| `palette` | `From<palette::*>` conversions into `Color`; re-exports `palette` crate |
| `portable-atomic` | atomics on targets lacking native atomic types |
| `scrolling-regions` | use terminal scroll regions (less flicker in `insert_before`) |
| `macros` (default) | the `ratatui::macros` module (`line!`, `span!`, …) |
| `all-widgets` (default) = `widget-calendar` | `widgets::calendar` (the `Monthly` widget); named `calendar` on `ratatui-widgets` itself |
| `underline-color` (default) | backend code for underline color (Crossterm/Termina/Termwiz only; not Win7) |
| `unstable` | = all three: `unstable-rendered-line-info` (`Paragraph::line_count` / `line_width`), `unstable-widget-ref` (`WidgetRef` / `StatefulWidgetRef` + `FrameExt::render_widget_ref`), `unstable-backend-writer` (access backend writers) |

- `default-features = false` drops all five defaults (the backend, `layout-cache`, `macros`, the calendar, underline color): list every feature you still need.
- Enable the one `unstable-*` flag you need, never the aggregate `unstable`.
- Keep one crossterm in the dependency graph: ratatui 0.30 pairs with crossterm 0.29 (`cargo tree -p crossterm`).

## 3. Terminal Initialization

From `ratatui` umbrella `init` module (feature `crossterm`), all re-exported at crate root. `init()`/`try_init()`/`run()` enable raw mode, enter the alternate screen and install a **panic hook** that restores the terminal; `init_with_options()`/`try_init_with_options()` enable raw mode and install the hook but do not enter the alternate screen.

```rust
// fragment
pub type DefaultTerminal = Terminal<CrosstermBackend<Stdout>>;

pub fn run<F, R>(f: F) -> R where F: FnOnce(&mut DefaultTerminal) -> R;  // owns setup+teardown
pub fn init() -> DefaultTerminal;  // panics on failure
pub fn init_with_options(options: TerminalOptions) -> DefaultTerminal;
pub fn restore();  // best-effort teardown
// fallible twins: try_init() / try_init_with_options(options) -> io::Result<DefaultTerminal>, try_restore() -> io::Result<()>
```

**USE THIS instead of hand-rolling** enable_raw_mode + EnterAlternateScreen + a panic hook:

```rust
// Simplest: ratatui owns the lifecycle.
use ratatui::crossterm::event::{self, Event, KeyCode, KeyEventKind, KeyModifiers};

fn main() -> std::io::Result<()> {
    ratatui::run(|terminal| {
        loop {
            terminal.draw(|frame| frame.render_widget("hello", frame.area()))?;
            if let Event::Key(key) = event::read()? {
                let ctrl_c = key.code == KeyCode::Char('c') && key.modifiers.contains(KeyModifiers::CONTROL);
                if key.kind == KeyEventKind::Press && (key.code == KeyCode::Char('q') || ctrl_c) {
                    break Ok(());
                }
            }
        }
    })
}
```

- Raw mode delivers Ctrl-C as a key event, not a signal: quit on it yourself, as above.

Manual lifecycle (still gets the panic hook + raw mode + alt screen). Capture the result, call `restore()`, then return it: a `?` before `restore()` skips teardown on every error path.

```rust
// fragment
let mut terminal = ratatui::init();
run_app(&mut terminal)?;  // WRONG: an error returns here and restore() never runs
let result = run_app(&mut terminal);  // RIGHT
ratatui::restore();
result
```

- `init()` installs a panic hook that calls `restore()` before the default hook, so a panic mid-draw won't leave the end user's terminal corrupted. Install your own panic hook before `init`/`run`: one set afterwards replaces the restoring hook.
- `Terminal::new(CrosstermBackend::new(..))` enables no raw mode, enters no alternate screen and installs no hook: without `run`/`init` you do all three yourself.
- Inline or fixed viewport: `ratatui::init_with_options(TerminalOptions { viewport: Viewport::Inline(8) })`.

## 4. Terminal & Frame

From `ratatui-core::terminal` (re-exported as `ratatui::{Terminal, Frame, TerminalOptions, Viewport, CompletedFrame}`).

### `Terminal<B: Backend>`

```rust
// fragment
// every fallible method returns Result<_, B::Error>
Terminal::new(backend)  // fullscreen; takes ONLY the backend
Terminal::with_options(backend, TerminalOptions { viewport })
terminal.draw(|frame: &mut Frame| { .. })  // -> Result<CompletedFrame, B::Error>
terminal.try_draw(|frame| -> Result<(), E> { .. })  // E: Into<B::Error>; for a render that can fail
terminal.clear()
terminal.insert_before(height: u16, |buf: &mut Buffer| { .. })  // inline viewports only; a no-op elsewhere
terminal.backend() -> &B;  terminal.backend_mut() -> &mut B
terminal.size() -> Result<Size, B::Error>;  terminal.resize(area: Rect);  terminal.autoresize()
terminal.hide_cursor();  terminal.show_cursor()
terminal.get_cursor_position() -> Result<Position, B::Error>;  terminal.set_cursor_position(impl Into<Position>)
// (get_cursor/set_cursor (u16,u16) are deprecated: use the Position ones)
// manual render path, tests and integrations only (it skips autoresize and the cursor): get_frame(), drop the
//   frame, then flush() (applies the diff), swap_buffers(), backend_mut().flush(); also current_buffer_mut(),
//   apply_buffer() / apply_buffer_with_cursor(Option<Position>)
```

- Render every widget on every pass, inside one `terminal.draw` call per loop iteration. Each pass starts from an empty buffer: a widget you skip is erased, and a second `draw` wipes the first.

```rust
// fragment
terminal.draw(|f| f.render_widget(&header, top))?;  // WRONG: two draws, the first frame is wiped
terminal.draw(|f| f.render_widget(&body, rest))?;
terminal.draw(|f| {  // RIGHT: one draw renders everything
    f.render_widget(&header, top);
    f.render_widget(&body, rest);
})?;
```

- A later render overwrites the cells of an earlier one: draw order is the z-order.
- After a `draw`/`try_draw` error the terminal and buffers may be out of sync: return the error, never swallow it or keep drawing.
- Render only through `Terminal::draw` / `try_draw`. A direct backend write bypasses the diff: follow it with `terminal.clear()?` or a full draw.
- No `terminal.flush()` after leaving raw mode or the alternate screen: it replays the old screen's diff. Run a full `draw`.

### `TerminalOptions` / `Viewport`

```rust
// fragment
pub struct TerminalOptions { pub viewport: Viewport }

pub enum Viewport {
    Fullscreen,  // default; alternate-screen full-window
    Inline(u16),  // N rows starting AT the cursor row, full width, scrolls with output; clamped to the terminal height
    Fixed(Rect),  // a fixed rectangle; never resizes itself: call terminal.resize(area)
}
```

`Fullscreen` and `Inline` pick up a new terminal size on the next `draw`: do nothing on `Event::Resize`.

### `Frame<'a>`: The Per-Draw Render Handle

```rust
// fragment
frame.area() -> Rect  // full drawable area: USE THIS for root layout
frame.render_widget(widget, area)  // W: Widget
frame.render_stateful_widget(widget, area, &mut state)  // W: StatefulWidget, state: &mut W::State
frame.set_cursor_position(impl Into<Position>)  // show a cursor at a cell
frame.buffer_mut() -> &mut Buffer  // raw buffer access
frame.count() -> usize  // frame number
```

- Take the area from `frame.area()`. `frame.size()` is deprecated (0.28); `terminal.size()` and `Event::Resize(w, h)` are not the render area. `Frame` has no backend type parameter (0.24).

```rust
// fragment
fn ui<B: Backend>(frame: &mut Frame<B>) { let area = frame.size(); }  // WRONG: does not compile
fn ui(frame: &mut Frame) { let area = frame.area(); }  // RIGHT
```

- One cursor path per app: `frame.set_cursor_position(..)` inside `draw` (a frame that skips it hides the cursor), or the `Terminal` cursor methods outside it. The next draw may overwrite the other path.

`CompletedFrame<'a>` is returned by `draw`; carries the rendered `buffer`, `area`, `count`.

## 5. Backend Trait & Backends

`ratatui::backend` re-exports: `Backend`, `ClearType`, `TestBackend`, `WindowSize`, and (per feature) `CrosstermBackend`/`TerminaBackend`/`TermionBackend`/`TermwizBackend` + their `From*`/`Into*` conversion traits.

### `Backend` Trait (`ratatui-core`)

You rarely implement this; use a provided backend. A custom backend sets `type Error` and implements, each returning `Result<_, Self::Error>`: `draw(content)` (an `Iterator<Item = (u16, u16, &Cell)>`), `hide_cursor`, `show_cursor`, `get_cursor_position` (-> `Position`), `set_cursor_position`, `clear`, `clear_region(ClearType)` (no default), `size` (-> `Size`), `window_size` (-> `WindowSize`), `flush`, plus `scroll_region_up`/`scroll_region_down` under feature `scrolling-regions`. Only `append_lines` (a no-op) and the deprecated `get_cursor`/`set_cursor` have defaults. `ClearType { All, AfterCursor, BeforeCursor, CurrentLine, UntilNewLine }`. `WindowSize { columns_rows, pixels }` (both `Size`): `pixels` may be `0,0`, so check it before dividing by it. `clear()` (the whole visible screen) and `clear_region(..)` blank cells ratatui may not have drawn, and leave the cursor where it was.

### `CrosstermBackend<W: Write>` (`ratatui-crossterm`)

`CrosstermBackend::new(writer)`, as in `Terminal::new(CrosstermBackend::new(std::io::stdout()))?`. `writer()` / `writer_mut()` need feature `unstable-backend-writer`; writing through them can corrupt later output.

Conversion traits `IntoCrossterm<C>` / `FromCrossterm<C>` (in `ratatui::backend`) bridge ratatui `Color`/`Style` to crossterm types; `Modifier` converts from crossterm only. They replace the plain `From`/`Into` impls (0.30): call `Color::from_crossterm(c)` / `color.into_crossterm()` with the trait imported, never `Color::from(c)` or `.into()`.

### `TestBackend` (`ratatui-core`): For Unit Tests

```rust
// fragment
TestBackend::new(width: u16, height: u16)
TestBackend::with_lines(lines)  // the size comes from the lines
backend.buffer() -> &Buffer;  backend.resize(width, height)
backend.assert_buffer(&Buffer);  backend.assert_buffer_lines(lines)  // compare to `Line`s
backend.assert_cursor_position(impl Into<Position>);  backend.cursor_visible() -> bool;  backend.cursor_position() -> Position
backend.scrollback() -> &Buffer  // captured insert_before output
backend.assert_scrollback(&Buffer) / assert_scrollback_empty() / assert_scrollback_lines(lines)
```

```rust
use ratatui::{Terminal, backend::TestBackend};

#[test]
fn renders_hi() {
    let mut terminal = Terminal::new(TestBackend::new(10, 3)).unwrap();
    terminal.draw(|f| f.render_widget("hi", f.area())).unwrap();
    terminal.backend().assert_buffer_lines(["hi        ", "          ", "          "]);
}
```

- `TestBackend`'s error type is `core::convert::Infallible` (0.30), not `std::io::Error`.

## 6. Layout

From `ratatui-core::layout` (`ratatui::layout`). Snippets assume `use ratatui::layout::Constraint::{Fill, Length, Min, Percentage};`.

### `Constraint`

```rust
// fragment
pub enum Constraint {
    Min(u16),  // at least N cells
    Max(u16),  // at most N cells
    Length(u16),  // exactly N cells (yields if no room)
    Percentage(u16),  // % of the WHOLE area, not of what is left
    Ratio(u32, u32),  // numerator/denominator of the whole area; thirds are Ratio(1, 3), never Percentage(33)
    Fill(u16),  // grow to fill leftover, weighted by the factor
}
// bulk builders -> Vec<Constraint>: from_lengths / from_mins / from_maxes / from_fills / from_percentages (u16 items), from_ratios ((u32, u32) items)
// From<u16> -> Constraint::Length, so Layout::vertical([1, 2, 3]) works
// Constraint::apply is deprecated (0.26): do not call it
```

- Conflicts are settled by constraint type, never by array order: `Min` > `Max` > `Length` > `Percentage` > `Ratio` > `Fill`.

```rust
// fragment
Layout::horizontal([Fill(1), Min(20)])  // WRONG to expect the first to win: 10 wide, Min takes all 10 and Fill gets 0
Layout::horizontal([Length(20), Fill(1)]) // RIGHT: 100 wide, Length gets its 20 and Fill the remaining 80
```

- `Percentage` and `Ratio` measure the whole area. For a share of what is left, use `Fill`.

```rust
// fragment
// the area is 100 wide
Layout::horizontal([Length(20), Percentage(50)])  // WRONG for "half of the rest": gives 20 + 50
Layout::horizontal([Length(20), Fill(1), Fill(1)])  // RIGHT: 20 + 40 + 40
```

- The region that takes the rest is `Fill(1)`; `Fill(1)` beside `Fill(2)` share the leftover 1:2. `Min(n)` also grows (equally with `Fill(1)` under the default flex) but keeps its floor. There is no `Constraint::Proportional`.

```rust
// fragment
Layout::vertical([Length(3), Min(0)])  // works, but reads as a hack
Layout::vertical([Length(3), Fill(1)])  // RIGHT: header, then a body that takes the rest
```

### `Direction` / `Flex` / `Spacing`

```rust
// fragment
pub enum Direction { Horizontal, Vertical }  // + const fn perpendicular(self)

pub enum Flex {  // how leftover space is distributed
    Legacy,  // pre-0.26 behaviour: the last segment stretches
    Start,  // DEFAULT: segments packed at the start; space no Fill/Min segment takes stays empty
    End, Center,  // pack at the end / center
    SpaceBetween,  // gaps between items only
    SpaceEvenly,  // equal gaps incl. edges
    SpaceAround,  // inner gaps are twice the edge gaps (flexbox; changed in 0.30)
}

pub enum Spacing { Space(u16), Overlap(u16) }  // gap or overlap between segments
// From<u16>/From<i16>/From<i32> for Spacing (negative -> Overlap)
```

- `horizontal` places segments side by side (columns); `vertical` stacks them top to bottom (rows).

```rust
// fragment
Layout::horizontal([Length(1), Fill(1)])  // WRONG for a title row above a body: this makes two columns
Layout::vertical([Length(1), Fill(1)])  // RIGHT
```

- The default flex is `Flex::Start`: fixed segments keep their size, and with no `Fill`/`Min` segment the leftover stays empty at the end. Pre-0.26 code expects the last segment to stretch: give one segment `Fill(1)`, or set `.flex(Flex::Legacy)`.

```rust
// fragment
// the area is 100 wide
Layout::horizontal([Length(20), Length(20)])  // WRONG if the 2nd should stretch: 60 columns stay empty
Layout::horizontal([Length(20), Fill(1)])  // RIGHT
```

- Gaps come from `.spacing(n)` or a `Flex::Space*` mode, never from a spacer `Length(1)` constraint. `.spacing(n)` is ignored under `Flex::Space*` and on a single segment; `.spacing(-1)` overlaps neighbours by one cell so their borders can merge (with `Block::merge_borders`).

### `Layout`

```rust
// fragment
Layout::vertical(constraints)  Layout::horizontal(constraints)  // USE THESE; IntoIterator<Item: Into<Constraint>>
Layout::new(direction, constraints)  // long form: Layout::default().direction(d).constraints(c)
.margin(u16)  .horizontal_margin(u16)  .vertical_margin(u16)  // a plain u16, never a Margin value
.flex(Flex)  // centering etc.
.spacing(impl Into<Spacing>)
layout.areas::<N>(area) -> [Rect; N]  // USE THIS (fixed count, no Vec). PANICS unless there are exactly N constraints
layout.try_areas::<N>(area) -> Result<[Rect; N], TryFromSliceError>
layout.split(area) -> Rc<[Rect]>  // runtime-known count
layout.spacers::<N>(area) -> [Rect; N]  // the gap rects (constraints + 1); split_with_spacers(area) -> (segments, spacers)
Layout::init_cache(cache_size: NonZeroUsize)  // feature `layout-cache`; optional, the size defaults to 500
```

**USE THIS instead of hand-rolling** split + index juggling: destructure `areas`. **Centering**: don't compute offsets manually, use `Flex::Center` or `Rect::centered`:

```rust
use ratatui::layout::{Constraint, Flex, Layout, Rect};

let area = Rect::new(0, 0, 80, 24);
let [header, body, footer] = Layout::vertical([
    Constraint::Length(3),
    Constraint::Fill(1),  // grows to fill
    Constraint::Length(1),
])
.areas(area);
let [dialog] = Layout::horizontal([Constraint::Length(40)]).flex(Flex::Center).areas(body);
assert_eq!((header.height, footer.height, dialog.width), (3, 1, 40));
let popup = area.centered(Constraint::Percentage(60), Constraint::Percentage(40));
assert!(popup.width <= area.width);
```

### `Rect`

```rust
// fragment
// Rect { x, y, width, height }, all u16. (0, 0) is the top-left cell; y grows DOWNWARD
Rect::new(x, y, width, height)  // clamps so right()/bottom() fit in u16; a `Rect { .. }` literal does not. Also Rect::ZERO, Rect::MAX
rect.area() -> u32  // never `width * height`: that overflows u16
rect.is_empty() -> bool
rect.left() / right() / top() / bottom() -> u16  // right() and bottom() are EXCLUSIVE
rect.inner(Margin)  // shrink by margin (per side): USE THIS for padding. By value; too large -> empty rect
rect.outer(Margin)  // grow; may leave the buffer: .clamp(area) it
rect.offset(Offset);  rect.resize(Size);  rect + Offset;  rect - Offset  // moves saturate at the u16 edges; never `rect + -offset`
rect.union(other);  rect.intersection(other)  // each RETURNS a Rect: the bounding box / the overlap
rect.clamp(other)  // move inside `other`, shrinking only if too big
rect.intersects(other) -> bool;  rect.contains(Position) -> bool  // USE THESE for overlap and hit tests
rect.rows() / columns() / positions()  // iterators: 1-high Rects / 1-wide Rects / every Position
rect.as_position() -> Position;  rect.as_size() -> Size
rect.centered(h: Constraint, v: Constraint)  // + centered_horizontally(c), centered_vertically(c): USE THESE
rect.layout::<N>(&layout) -> [Rect; N];  rect.try_layout::<N>(&layout);  rect.layout_vec(&layout) -> Vec<Rect>
```

- `right()` and `bottom()` are the first coordinate outside the rect.

```rust
// fragment
for x in rect.left()..=rect.right() { .. }  // WRONG: one column too far
for x in rect.left()..rect.right() { .. }  // RIGHT (or: for pos in rect.positions() { .. })
```

- y grows downward: the top row has the smallest y.

```rust
// fragment
let header = Position::new(area.x, area.bottom() - 1);  // WRONG: that is the bottom row
let header = Position::new(area.x, area.y);  // RIGHT
```

- A margin is per side: `Margin::new(2, 1)` removes 4 columns and 2 rows.

### `Size`, `Position`, `Offset`, `Margin`, `Alignment`

```rust
// fragment
Size { width: u16, height: u16 }  // new(w,h); area() -> u32; ZERO/MAX
Position { x: u16, y: u16 }  // new(x,y); ORIGIN; offset(Offset)
Offset { x: i32, y: i32 }  // signed; new(x,y); ZERO
Margin { horizontal: u16, vertical: u16 }  // new(h,v), per side; From<u16>
enum HorizontalAlignment { Left, Center, Right }  // the name since 0.30; `Alignment` is the back-compat alias,
//   but a glob import needs the new name: `use HorizontalAlignment::*;`, never `use Alignment::*;`
enum VerticalAlignment { Top, Center, Bottom }  // exported, but no ratatui API takes it yet
```

`Position`/`Size` convert from/to `(u16,u16)` and from `Rect`; `pos + offset`, `pos - offset`, `rect + offset`, `rect - offset` (and `+=`/`-=`) work, and `offset + pos`/`offset + rect` too; there is no `offset - ..`.

## 7. Style

From `ratatui-core::style` (`ratatui::style`).

### `Style`

```rust
// fragment
// fields: fg, bg, underline_color (feature underline-color): Option<Color>; add_modifier, sub_modifier: Modifier. Use the builders, never a `Style { .. }` literal
Style::new()  // empty: patching it changes nothing (same as Style::default())
Style::reset()  // associated fn: resets everything. There is no `some_style.reset()`
.fg(Color)  .bg(Color)  .underline_color(Color)
.add_modifier(Modifier)  .remove_modifier(Modifier)  // several at once: Modifier::BOLD | Modifier::ITALIC
.has_modifier(Modifier) -> bool
.patch(impl Into<Style>)  // layer styles
// + every `Stylize` shorthand as an inherent const fn (0.30; no import needed): Style::new().red().on_black().bold()
// From: Color, (Color,Color), Modifier, and tuples up to (Color,Color,Modifier,Modifier)
```

- A `Style` is a partial change. `patch` (and every `patch_style`) overwrites only the fields the new style sets and merges its modifiers; the rest survives.

```rust
// fragment
let base = Style::new().yellow().bold();
let cell = base.patch(Style::new().on_red());  // yellow + BOLD + red background. WRONG to expect fg and BOLD gone
let plain = base.patch(Style::reset());  // RIGHT way to drop what came before
```

- Turn a modifier off with `.remove_modifier(Modifier::BOLD)` or `.not_bold()`: a bare `Style::new()` cannot.
- Every style parameter is `impl Into<Style>`: pass `Color::Red` or `(Color::Red, Modifier::BOLD)` directly, and type your own style parameters the same way.

### `Color`

```rust
// fragment
pub enum Color {
    Reset,
    Black, Red, Green, Yellow, Blue, Magenta, Cyan, Gray, DarkGray,
    LightRed, LightGreen, LightYellow, LightBlue, LightMagenta, LightCyan, White,
    Rgb(u8, u8, u8),  // 24-bit truecolor: needs a truecolor terminal, prefer named or Indexed colors
    Indexed(u8),  // 256-color palette index
}
// Gray is the ordinary light gray (ANSI 37); White is BRIGHT white (ANSI 97)
pub const fn from_u32(u: u32) -> Self;  // 0x00RRGGBB
// feature palette: Color::from_hsl(palette::Hsl), Color::from_hsluv(palette::Hsluv)
// FromStr ("red", "#ff8800", ...); From<[u8;3]>, From<(u8,u8,u8)>, +alpha variants
```

Bundled palettes (constants under `style::palette`): `tailwind::{SLATE, RED, BLUE, EMERALD, ...}` (each a `Palette` with shade fields) and `material::{RED, BLUE, GRAY, ...}`.

### `Modifier` (Bitflags)

```rust
// fragment
Modifier::{ BOLD, DIM, ITALIC, UNDERLINED, SLOW_BLINK, RAPID_BLINK, REVERSED, HIDDEN, CROSSED_OUT }  // bitflags over u16
```

### `Stylize` Trait: The Ergonomic Shorthand

`Stylize` is implemented for `&str`, `String`, `Cow<str>`, `Span`, `Line`, `Text` and every built-in widget except `Clear`, `Scrollbar`, `Canvas`, `Monthly`, `RatatuiLogo` and `RatatuiMascot` (those are not `Styled`). It returns the styled value, so you chain it.

Core methods: `fg(impl Into<Color>)`, `bg(impl Into<Color>)`, `reset()`, `add_modifier(Modifier)`, `remove_modifier(Modifier)`.

**Generated shorthands**: colors (foreground + `on_` background) and modifiers (each has a `not_` negation):

```
black/red/green/yellow/blue/magenta/cyan/gray/dark_gray/
light_red/light_green/light_yellow/light_blue/light_magenta/light_cyan/white  // + on_black, on_red, ... on_white
bold/dim/italic/underlined/slow_blink/rapid_blink/reversed/hidden/crossed_out  // + not_bold, not_dim, ...
```

**USE THIS instead of hand-rolling `Style::new().fg(...).add_modifier(...)`:**

```rust
use ratatui::{style::Stylize, text::Span, widgets::Block};

let s = "ERROR".red().bold().on_white();  // Span with style
let warn = Span::raw("careful").yellow().underlined();
let block = Block::bordered().blue();  // any `Styled` widget
```

- Import `Stylize` from `ratatui::style`, never crossterm's (`ratatui::crossterm::style::Stylize`): with both in scope the calls are ambiguous.
- A shorthand consumes a `String`: write `s.clone().red()` when `s` is used again.

`Styled` trait (low-level): `style()` getter + `set_style()` (the whole-style setter: `Stylize` has no `style` method); `Stylize` is the blanket impl over it.

## 8. Text

From `ratatui-core::text` (`ratatui::text`). Hierarchy: `Text` (multi-line) → `Line` (one row of spans) → `Span` (a styled string).

```rust
// fragment
// Span<'a>, a styled string fragment
Span::raw(content)  // no style argument
Span::styled(content, impl Into<Style>)
.content(impl Into<Cow<str>>)  .style(..)  .patch_style(..)  .reset_style()
span.width() -> usize
span.into_left_aligned_line() / into_centered_line() / into_right_aligned_line() -> Line  // the to_* names are deprecated
// From<&str>, From<String>, From<Cow<str>>; Add<Span> -> Line

// Line<'a>, one terminal row: a Vec<Span> + alignment
Line::raw(content)  Line::styled(content, impl Into<Style>)  Line::from(..)
.spans(iter)  .style(..)  .patch_style(..)
.alignment(Alignment)  .left_aligned()  .centered()  .right_aligned()  // USE centered() for centered titles/lines
line.width() -> usize;  line.push_span(span);  line.iter()
// From<&str>, From<String>, From<Span>, From<Vec<Span>>; Add<Span>, Add<Line>

// Text<'a>, a multi-line block: a Vec<Line>
Text::raw(content)  Text::styled(content, impl Into<Style>)  Text::from(..)  // string content is split on '\n'
.style(..)  .patch_style(..)  .alignment(Alignment)  .left_aligned()  .centered()  .right_aligned()
text.width() -> usize;  text.height() -> usize  // widest line in terminal columns; number of lines
text.push_line(line);  text.push_span(span)  // push_span appends to the LAST line
// From<&str>/<String>/<Span>/<Line>/<Vec<Line>>; Add. All three implement Widget and Stylize
```

- A `Line` is exactly one row. A `\n` inside it never starts a new row, and a line longer than its area is cut, not wrapped (wrapping is `Paragraph::wrap`).

```rust
// fragment
Text::from(Line::from("row1\nrow2"))  // WRONG: still one row
Text::from(vec![Line::from("row1"), Line::from("row2")])  // RIGHT (or Text::from("row1\nrow2"))
```

- `.style(s)` replaces the whole style; `.patch_style(s)` adds to it. Same on `Span`, `Line` and `Text`.

```rust
// fragment
Line::styled("text", (Color::Yellow, Modifier::ITALIC)).style(Color::Red)  // WRONG: ITALIC is lost
Line::styled("text", (Color::Yellow, Modifier::ITALIC)).patch_style(Color::Red)  // RIGHT: red + ITALIC
```

- Styles nest widget → `Text` → `Line` → `Span`: the outer style is the base and the inner one wins, field by field. Alignment: a `Line`'s own wins. A `Paragraph` starts from its `Text`'s alignment, and a later `.alignment(..)` on the paragraph replaces that.

```rust
// fragment
Text::from(Line::from("hi").blue()).red()  // WRONG to expect red: the Line's blue wins
Text::from(Line::from("hi")).red()  // RIGHT: the Line sets no color, so it takes the Text's
```

- `Spans` was removed in 0.24: the type is `Line`.

```rust
// fragment
let row = Spans::from(vec![Span::raw("Hello ")]);  // WRONG: does not compile
let row = Line::from(vec![Span::raw("Hello ")]);  // RIGHT; into a buffer: buf.set_line(x, y, &row, width), never set_spans
```

- Pass `&str`/`String` wherever text is expected. Build a `Span`, `Line` or `Text` only when a part needs its own style.
- Measure `Text` with `.width()` and `.height()` (display columns, line count); a `Span` or `Line` has only `.width()`. Never `str::len()` or `chars().count()`.
- A `Line { .. }` struct literal needs `..Default::default()` (the `style` field, 0.26), and its `alignment` is an `Option`: use the constructors instead.
- `.clone()` on a `Span`/`Line`/`Text` keeps its borrow: build stored text (`Line<'static>`) from owned `String`s.

`Masked::new(impl Into<Cow<str>>, mask_char: char)` renders a string as repeated mask chars (password fields): `.mask_char()`, `.value()`; `Into<Text>`, `Into<Cow<str>>`. `{}` prints the mask, `{:?}` the SECRET: never Debug-log it.

**USE THESE `From`/builder ergonomics instead of hand-constructing structs:** `Line::from(vec!["a".red(), " b".green()])`, `Line::from("Title").centered().bold()`, `let text: Text = "line1\nline2".into();` (import `ratatui::style::Stylize`). The `ratatui::text` traits `ToLine` / `ToSpan` / `ToText` give `.to_line()` / `.to_span()` / `.to_text()` on any `Display`.

`StyledGrapheme<'a>` (from `span.styled_graphemes(base_style)`) is a render-time unit: build text from `Span`s, never from graphemes.

## 9. Buffer & Cell

From `ratatui-core::buffer` (`ratatui::buffer`). The buffer is the 2-D grid of `Cell`s the terminal diffs.

```rust
// fragment
// Buffer { pub area: Rect, pub content: Vec<Cell> }
Buffer::empty(area)  Buffer::filled(area, cell: Cell)
Buffer::with_lines(lines)  // tests; the size comes from the lines
buf.cell(pos) -> Option<&Cell>;  buf.cell_mut(pos) -> Option<&mut Cell>  // pos: impl Into<Position>, e.g. (x, y)
buf[(x, y)]  buf[Position]  // Index/IndexMut: PANICS outside the area
buf.set_string(x, y, s, style)  // returns (). Start inside the area (buf.area.contains(..)): an outside y PANICS
buf.set_stringn(x, y, s, max_width, style) / set_line(x, y, &line, max_width) / set_span(x, y, &span, max_width) -> (u16, u16)
buf.set_style(area, style)
buf.resize(area);  buf.reset();  buf.merge(&other);  buf.diff(&other) -> Vec<(u16, u16, &Cell)>
buf.diff_iter(&other) -> BufferDiff  // lazy; PANICS unless both buffers share x, y and width

// Cell
Cell::EMPTY  Cell::new(symbol: &'static str) // runtime text: Cell::default(), then cell.set_symbol(&s)
cell.symbol() -> &str
cell.set_symbol(&str)  .set_char(char)  .set_fg(Color)  .set_bg(Color)  .set_style(impl Into<Style>)  // each -> &mut Cell
cell.style() -> Style;  cell.reset()
cell.set_diff_option(CellDiffOption)  // { None, Skip, AlwaysUpdate, ForcedWidth(NonZeroU16) }
cell.merge_symbol(&str, MergeStrategy)  // join border glyphs
// deprecated: set_skip(bool) and the `skip` field -> set_diff_option(CellDiffOption::Skip). From<char>
```

- `buf.get(x, y)` / `get_mut` are deprecated. Index with `buf[(x, y)]` only where the position is known to be inside; otherwise `buf.cell((x, y))` / `cell_mut`.
- Draw text by rendering a `Span`/`Line`/`Text` (`line.render(area, buf)`, with `Widget` in scope): it clips to the buffer and honours alignment, which `set_line` ignores.
- After writing a double-width symbol with `set_symbol`, reset the cell to its right: `if let Some(c) = buf.cell_mut((x + 1, y)) { c.reset(); }` (indexing panics at the edge).

## 10. Symbols

From `ratatui-core::symbols` (`ratatui::symbols`). String/char constants + `Set` structs used by widgets.

| Module | Contents |
|---|---|
| `border` | `Set` + `PLAIN, ROUNDED, DOUBLE, THICK, *_DASHED, QUADRANT_*, ONE_EIGHTH_*, PROPORTIONAL_*, FULL, EMPTY` |
| `line` | `Set` + `NORMAL, ROUNDED, DOUBLE, THICK, *_DASHED`; raw glyphs `VERTICAL, HORIZONTAL, CROSS, TOP_LEFT, ...` |
| `block`, `bar` | `FULL, SEVEN_EIGHTHS … ONE_EIGHTH`; `Set` + `THREE_LEVELS, NINE_LEVELS` |
| `braille`, `pixel`, `half_block`, `shade` | glyph tables: `BRAILLE: [char; 256]`, `QUADRANTS[16]`, `SEXTANTS[64]`, `OCTANTS[256]`; `UPPER='▀', LOWER='▄', FULL='█'`; `EMPTY, LIGHT, MEDIUM, DARK, FULL` |
| `scrollbar` | `Set` + `VERTICAL, HORIZONTAL, DOUBLE_VERTICAL, DOUBLE_HORIZONTAL` |
| `merge` | `MergeStrategy { Replace, Exact, Fuzzy }` for border-joining |

```rust
// fragment
#[non_exhaustive]
pub enum Marker { Dot, Block, Bar, Braille, HalfBlock, Quadrant, Sextant, Octant, Custom(char) }  // symbols::Marker
```

Used by `Canvas::marker(...)` and `Dataset::marker(...)`. `Braille` and `Octant` both give the highest per-cell resolution (2x4); `Sextant` is 2x3, `Quadrant` 2x2. They need font support: fall back to `Dot`, `Block` or `Bar`. `Marker` is `#[non_exhaustive]` (0.30): every `match` on it needs a `_` arm.

```rust
// fragment
match marker { Marker::Dot => dots(), Marker::Braille => braille() }  // WRONG: does not compile
match marker { Marker::Dot => dots(), Marker::Braille => braille(), _ => fallback() }  // RIGHT
```

## 11. Widget Traits

From `ratatui-core::widgets` (`Widget`, `StatefulWidget`) and `ratatui::widgets` (`BlockExt`; behind feature `unstable-widget-ref`: `WidgetRef`, `StatefulWidgetRef`, `FrameExt`).

### `Widget`

```rust
// fragment
pub trait Widget {
    fn render(self, area: Rect, buf: &mut Buffer) where Self: Sized;
}
```

Built-in blanket impls: `Widget for &str`, `for String`, `for Option<W: Widget>` (`None` draws nothing: no `if let` around an optional child).

- Implement the trait with exactly that signature. A `Frame` never appears in it.

```rust
// fragment
impl Widget for MyWidget { fn render(&self, f: &mut Frame) { .. } }  // WRONG: does not compile
impl Widget for &MyWidget { fn render(self, area: Rect, buf: &mut Buffer) { .. } }  // RIGHT
```

**0.30 pattern: implement `Widget for &T` (not `WidgetRef`)** so the widget can render by reference without consuming itself. Most built-in widgets implement both `Widget for T` and `Widget for &T`; `RatatuiLogo` and `RatatuiMascot` implement it for the owned value only, and `Scrollbar` is `StatefulWidget`-only.

```rust
use ratatui::{buffer::Buffer, layout::Rect, text::Line, widgets::Widget};

struct Greeting { name: String }

impl Widget for &Greeting {  // render by ref: the modern idiom
    fn render(self, area: Rect, buf: &mut Buffer) {
        if area.is_empty() { return; }  // guard before any u16 math on the area
        Line::raw(format!("Hi {}", self.name)).render(area, buf);
    }
}
// usage: frame.render_widget(&greeting, area);  // greeting not moved
```

### `StatefulWidget`

```rust
// fragment
pub trait StatefulWidget {
    type State: ?Sized;
    fn render(self, area: Rect, buf: &mut Buffer, state: &mut Self::State);
}
```

Used by `List` (`ListState`), `Table` (`TableState`), `Scrollbar` (`ScrollbarState`). Render via `frame.render_stateful_widget(widget, area, &mut state)`.

- Keep the state in the app struct and pass `&mut` to it every frame. A state built inside `draw` resets selection and scroll each frame, and `render_widget` on a `List`/`Table` never applies either. Reset the state when the items are replaced.

```rust
// fragment
terminal.draw(|f| {
    let mut state = ListState::default();  // WRONG: rebuilt every frame
    f.render_stateful_widget(list, f.area(), &mut state);
})?;
terminal.draw(|f| f.render_stateful_widget(list, f.area(), &mut app.list_state))?;  // RIGHT
```

- A widget with nothing to remember implements `Widget`, never `StatefulWidget` with `type State = ()`.

### `WidgetRef` / `StatefulWidgetRef`: Feature `unstable-widget-ref`

`WidgetRef::render_ref(&self, area, buf)` and `StatefulWidgetRef::render_ref(&self, area, buf, state)`.

> **Deprecated direction in 0.30.** Prefer `impl Widget for &MyWidget`. Use `WidgetRef` only if you need trait-object boxing (`Box<dyn WidgetRef>`). `FrameExt` adds `render_widget_ref` / `render_stateful_widget_ref` for these.

## 12. Widgets

All from `ratatui-widgets`, re-exported under `ratatui::widgets`. Most widgets implement `Widget` + `Widget for &T` and `Styled`/`Stylize` (exceptions: §7, §11); stateful ones add `StatefulWidget`.

- Builder setters consume the widget and return it. A setter called as a bare statement changes nothing: chain or rebind. `unused_must_use`
- Give a widget its border through `.block(..)`: a `Block` and its content rendered separately into one area overlap.
- Widgets implement `AsRef<Self>` since 0.30.1: when a bare `.as_ref()` argument stops inferring, name the type (`.as_str()` on a `String`).

```rust
// fragment
let list = List::new(items);
list.highlight_symbol(">> ");  // WRONG: the result is dropped
let list = List::new(items).highlight_symbol(">> ");  // RIGHT
frame.render_widget(Block::bordered(), area);
frame.render_widget(paragraph, area);  // WRONG: text draws over the border
frame.render_widget(paragraph.block(Block::bordered().title("Logs")), area);  // RIGHT
```

### Block

```rust
// fragment
Block::new()  Block::bordered()  // bordered() = new().borders(Borders::ALL): USE THIS
.title(impl Into<Line>)  .title_top(..)  .title_bottom(..)  .title_style(..)  .title_alignment(Alignment)
.title_position(TitlePosition)  // Top | Bottom
.borders(Borders)  // bitflags u8: NONE, TOP, RIGHT, BOTTOM, LEFT, ALL
.border_type(BorderType)  .border_set(border::Set)  // e.g. symbols::border::ROUNDED; the later call wins
.border_style(..)  // colors the frame only; .style(..) is the whole block
.padding(Padding)  .merge_borders(MergeStrategy)  .shadow(Shadow)
block.inner(area) -> Rect  // the content area inside borders/titles/padding
// BorderType: Plain, Rounded, Double, Thick, LightDoubleDashed, HeavyDoubleDashed, LightTripleDashed,
//   HeavyTripleDashed, LightQuadrupleDashed, HeavyQuadrupleDashed, QuadrantInside, QuadrantOutside
// Padding::new(left, right, top, bottom)  ::ZERO  ::uniform(v)  ::horizontal(v)  ::vertical(v)  ::symmetric(x, y)
//   ::left(v)  ::right(v)  ::top(v)  ::bottom(v)  ::proportional(v); From<u16>
// Shadow::overlay() / block() / light_shade() / medium_shade() / dark_shade(), .style(..), .offset(Offset);
//   dimmed() -> Dimmed effect; Shadow::custom(impl CellEffect): widgets::CellEffect needs Debug + Send + Sync + UnwindSafe + RefUnwindSafe
```

- A title is a `Line`: align the `Line`, pick the edge with `title_top`/`title_bottom`. `block::Title` was removed (0.30), `.title_on_bottom()` (0.26).
- Take the content area from `block.inner(area)`, never by subtracting the border by hand: titles and padding cost cells too.
- `Padding::new` takes left, right, top, bottom: not the CSS order.

```rust
// fragment
Block::default().title(Title::from("Hi").alignment(Alignment::Center))  // WRONG: does not compile
Block::bordered().title(Line::from("Hi").centered())  // RIGHT
let inner = Rect { x: area.x + 1, y: area.y + 1, ..area };  // WRONG: hand-made inner area
let inner = block.inner(area);  // RIGHT: take it before rendering the block
Padding::new(1, 2, 3, 4)  // WRONG for top 1, right 2, bottom 3, left 4
Padding::new(4, 2, 1, 3)  // RIGHT
```

### Paragraph

```rust
// fragment
Paragraph::new(impl Into<Text>)
.block(Block)  .style(..)
.wrap(Wrap { trim: bool })  // trim: drop leading whitespace of wrapped lines (false keeps indentation)
.scroll((y, x))  // (vertical, horizontal), u16 each
.alignment(Alignment)  .left_aligned()  .centered()  .right_aligned()
// line_count(width) / line_width() need the non-default feature unstable-rendered-line-info
```

- A `Paragraph` cuts long lines off unless you call `.wrap(..)`. Its scroll offset is `(y, x)`: lines first.

```rust
// fragment
Paragraph::new(long_text)  // WRONG if the text can exceed the width: the rest is invisible
Paragraph::new(long_text).wrap(Wrap { trim: true })  // RIGHT
Paragraph::new(text).scroll((0, 3))  // WRONG for "3 lines down": this is 3 columns right
Paragraph::new(text).scroll((3, 0))  // RIGHT
```

### List

```rust
// fragment
List::new(items)  // IntoIterator<Item: Into<ListItem>>: &str, String, Line, Text. Or iter.collect::<List>()
List::default()  // the empty list
.items(items)  .block(Block)  .style(..)
.highlight_symbol(impl Into<Line>)  // e.g. ">> "
.highlight_style(..)  // covers the whole selected item
.repeat_highlight_symbol(bool)  // on every line of a multi-line item
.highlight_spacing(HighlightSpacing)  // Always | WhenSelected (default) | Never
.direction(ListDirection)  // TopToBottom | BottomToTop
.scroll_padding(usize)  // keep N items visible around the selection
list.len() -> usize
ListItem::new(impl Into<Text>)  .style(..);  item.height();  item.width()  // the Text's own style wins over the item's.
//   No alignment setter on List, ListItem or a table Cell: align the Text inside

ListState::default()  .with_offset(usize)  .with_selected(Option<usize>)
state.selected() -> Option<usize>;  state.select(Option<usize>)
state.select_next() / select_previous() / select_first() / select_last()  // USE THESE, not `selected().unwrap() + 1`
state.scroll_down_by(u16) / scroll_up_by(u16)
```

- The renderer owns `ListState`'s offset: each stateful render rewrites it and clamps an out-of-range selection to the last item. Until then `select_last()` holds `usize::MAX`: read `selected()` after a render.
- With a highlight symbol on a `List` or `Table`, set `.highlight_spacing(HighlightSpacing::Always)`: otherwise every row shifts sideways when a selection appears.

```rust
// fragment
List::new(items).highlight_symbol(">> ")  // WRONG
List::new(items).highlight_symbol(">> ").highlight_spacing(HighlightSpacing::Always)  // RIGHT
```

### Table

```rust
// fragment
Table::new(rows, widths)  // BOTH required. rows: Into<Row> items; widths: Into<Constraint> items (u16 works)
Table::default()  // the empty table: then .rows(..).widths(..)
.rows(rows)  .widths(widths)  .header(Row)  .footer(Row)  .column_spacing(u16)
.block(Block)  .style(..)
.row_highlight_style(..)  .column_highlight_style(..)  .cell_highlight_style(..)
.highlight_symbol(impl Into<Text>)  .highlight_spacing(HighlightSpacing)
.flex(Flex)  // distribute leftover column space
Row::new(cells)  .style(..)  .height(u16)  // set height(n) for multi-line cells
.top_margin(u16)  .bottom_margin(u16)  // header spacing: bottom_margin(1), not an empty row
Cell::new(impl Into<Text>)  .content(..)  .column_span(u16)  .style(..)  // style precedence: Row < Cell < its Text
```

`TableState`: like `ListState` plus column/cell selection: `select_column`, `select_cell`, `with_selected_cell`, `selected_column`, `selected_cell`, `scroll_right_by/left_by`, etc.

- `Table::new` takes the widths as its second argument. With no widths every column gets an equal share.
- `Table::new` and `.widths(..)` PANIC on `Constraint::Percentage(p)` with `p > 100`: validate widths read from config.

```rust
// fragment
Table::new(rows).widths(&[Constraint::Length(5)])  // WRONG: does not compile (0.25)
Table::new(rows, [Constraint::Length(5), Constraint::Fill(1)])  // RIGHT
```

### Tabs

```rust
// fragment
Tabs::new(titles)  // required: IntoIterator<Item: Into<Line>>
Tabs::default().titles(titles)  // titles(..) since 0.29
.select(impl Into<Option<usize>>)  // 0-based; select(None) deselects (0.29)
.block(Block)  .style(..)
.highlight_style(..)  // REPLACES the default reversed look: add .reversed() to keep it
.divider(impl Into<Span>)  .padding(impl Into<Line>, impl Into<Line>)  .padding_left(..)  .padding_right(..)
```

- Render `Tabs` with `render_widget`: it is `Widget`-only, so `render_stateful_widget` does not compile.
- Pass iterators straight in: a `.collect()` argument or an empty `vec![]` does not infer.

```rust
// fragment
Tabs::new((0..3).map(|i| format!("{i}")).collect())  // WRONG: does not compile. Same for List::new(vec![])
Tabs::new((0..3).map(|i| format!("{i}")))  // RIGHT; the empty list is List::default()
```

### Gauge / LineGauge

```rust
// fragment
Gauge::default()  // block bar with % label
.percent(u16)  // 0..=100; PANICS above
.ratio(f64)  // 0.0..=1.0; PANICS outside
.gauge_style(..)  // colors the bar; .style(..) only reaches the background
.label(impl Into<Span>)  .use_unicode(bool)  .block(Block)  // use_unicode: sub-cell resolution
LineGauge::default()  // single-line progress: use it, not a Gauge, in a 1-row area. Always 1 row high, label on the left
.ratio(f64)  .label(impl Into<Line>)
.filled_symbol(&str)  .unfilled_symbol(&str)  .filled_style(..)  .unfilled_style(..)
// deprecated on LineGauge: gauge_style (0.27) -> filled_style, line_set (0.30) -> filled_symbol + unfilled_symbol

Gauge::default().ratio(42.0)  // WRONG: panics, ratio is a fraction
Gauge::default().percent(42)  // RIGHT (or .ratio(0.42))
```

### BarChart

```rust
// fragment
BarChart::default()  BarChart::new(bars)  BarChart::vertical(bars)  BarChart::horizontal(bars)  BarChart::grouped(groups)
.data(impl Into<BarGroup>)  // &[("label", 5)] works (u64 values); each call APPENDS a group
.max(u64)  // fixed scale; the default scale is the largest value
.bar_width(u16)  // default 1 cell: set it. In a horizontal chart it is the bar height
.bar_gap(u16)  .group_gap(u16)  .bar_set(symbols::bar::Set)
.bar_style(..)  .value_style(..)  .label_style(..)  .direction(Direction)  .block(Block)
Bar::new(value: u64)  Bar::with_label(label, value)  .value(u64)  .label(impl Into<Line>)  .style(..)  .value_style(..)
.text_value(impl Into<String>)  // text shown instead of the number, e.g. "10°C"
BarGroup::new(bars)  BarGroup::with_label(label, bars)  .label(..)  .bars(&[Bar])  // a group with no bars is not drawn

BarChart::default().data(&[("Mon", 5), ("Tue", 8)])  // WRONG: bars are 1 cell wide
BarChart::default().data(&[("Mon", 5), ("Tue", 8)]).bar_width(5)  // RIGHT
```

- Bar and group labels are drawn inside the chart's own area: give the chart the height, add no label row beside it.

### Chart

```rust
// fragment
Chart::new(datasets: Vec<Dataset>)  // axes are setters, not constructor arguments
.x_axis(Axis)  .y_axis(Axis)  .block(Block)  .style(..)
.legend_position(Option<LegendPosition>)  .hidden_legend_constraints((Constraint, Constraint))
Axis::default()  .title(impl Into<Line>)  .bounds([f64; 2])  .labels(iter)  .style(..)  .labels_alignment(Alignment)
Dataset::default()  .name(impl Into<Line>)  .data(&[(f64, f64)])  .marker(symbols::Marker)
.graph_type(GraphType)  .style(..)  .fill_to_y(f64)
pub enum GraphType { Scatter, Line, Bar, Area }  // default: Scatter
pub enum LegendPosition { Top, TopRight, TopLeft, Left, Right, Bottom, BottomRight, BottomLeft }
```

- Give both axes `.bounds([min, max])` that cover the data: the default bounds are `[0.0, 0.0]` and plot nothing, and points outside the bounds are dropped.
- Set `.graph_type(GraphType::Line)` for a connected line: the default `Scatter` draws dots only.

```rust
// fragment
let chart = Chart::new(vec![Dataset::default().data(&points)]);  // WRONG: no bounds, no graph type
let series = Dataset::default().name("cpu").data(&points)  // RIGHT
    .marker(symbols::Marker::Braille).graph_type(GraphType::Line).cyan();
let chart = Chart::new(vec![series])
    .x_axis(Axis::default().bounds([0.0, 10.0]).labels(["0", "5", "10"]))
    .y_axis(Axis::default().bounds([0.0, 100.0]).labels(["0", "100"]));
```

- `.data(..)` borrows a slice (`&points`); points join in slice order: sort a line's points by x. An axis shows labels only when it has two or more. Only named datasets appear in the legend. Color the series on the `Dataset`.

### Sparkline

```rust
// fragment
Sparkline::default()
.data(iter)  // items Into<SparklineBar>: u64, Option<u64> (None = absent), or SparklineBar with .style(Option<Style>)
.max(u64)  // set it for live data, else every frame rescales to its own maximum
.bar_set(symbols::bar::Set)  .direction(RenderDirection)  // LeftToRight | RightToLeft
.style(..)  .absent_value_style(..)  .absent_value_symbol(impl Into<String>)  .block(Block)
```

### Scrollbar

```rust
// fragment
Scrollbar::new(ScrollbarOrientation)  // VerticalRight | VerticalLeft | HorizontalBottom | HorizontalTop
.orientation(..)  .thumb_symbol(&str)  .thumb_style(..)  .track_symbol(Option<&str>)  .track_style(..)
.begin_symbol(Option<&str>)  .begin_style(..)  .end_symbol(Option<&str>)  .end_style(..)
.symbols(symbols::scrollbar::Set)  .style(..)
ScrollbarState::new(content_length: usize)  // ScrollbarState::default() has length 0 and renders NOTHING
.position(usize)  .content_length(usize)  .viewport_content_length(usize)  // viewport = items visible at once
state.prev() / next() / first() / last();  state.scroll(ScrollDirection);  state.get_position() -> usize  // Forward | Backward

// stateful only, and a separate widget drawn beside the content: no widget draws its own scrollbar
let sb = Scrollbar::new(ScrollbarOrientation::VerticalRight).begin_symbol(Some("↑")).end_symbol(Some("↓"));
frame.render_stateful_widget(sb, area.inner(Margin { vertical: 1, horizontal: 0 }), &mut scrollbar_state);
```

### Canvas + Shapes

`widgets::canvas` module. Draw arbitrary 2-D shapes onto a Braille/half-block/quadrant grid.

```rust
// fragment
// Canvas<'a, F: Fn(&mut Context)>
Canvas::default()
.block(Block)  .x_bounds([left, right])  .y_bounds([bottom, top])  // f64; never inverted or zero-width
.marker(symbols::Marker)  .background_color(Color)
.paint(|ctx| { .. })  // REQUIRED, last: it fixes the closure type F and does the drawing
// Context: ctx.draw(&shape), ctx.print(x, y, impl Into<Line>), ctx.layer(), ctx.marker(m)
// Shapes (canvas::*, all impl Shape): Line::new(x1, y1, x2, y2, color), FilledLine::new(x1, y1, x2, y2, fill_to_y, color),
//   Rectangle::new(x, y, width, height, color), Circle::new(x, y, radius, color), Points::new(&[(f64, f64)], color),
//   Map { resolution: MapResolution::{Low, High}, color }. Text: ctx.print (`Label` is not a Shape)
// Custom shape: impl Shape { fn draw(&self, painter: &mut Painter) }, never Widget. painter.get_point(x, y) is an
//   Option (None outside the bounds: handle it, never `unwrap` or `expect`); painter.paint(x, y, Color); painter.bounds()
```

- Canvas and chart coordinates are math-style: origin bottom-left, y grows upward. A canvas `Rectangle` is placed by its bottom-left corner.
- `ctx.draw` takes the shape by reference; coordinates are f64 in the bounds' units, not cells.
- A `Canvas` chain ends with `.paint(..)`: without it the type does not infer and nothing is drawn.

```rust
// fragment
let canvas = Canvas::default().x_bounds([-180.0, 180.0]).y_bounds([-90.0, 90.0]);  // WRONG: no .paint(..), does not compile
let canvas = Canvas::default().x_bounds([-180.0, 180.0]).y_bounds([-90.0, 90.0]).paint(|ctx| {  // RIGHT
    ctx.draw(Circle::new(0.0, 0.0, 10.0, Color::Red));  // WRONG: by value
    ctx.draw(&Circle::new(0.0, 0.0, 10.0, Color::Red));  // RIGHT
    ctx.draw(&canvas::Line::new(-180.0, 90.0, 180.0, 90.0, Color::White));  // y = 90.0 is the TOP edge
    ctx.draw(&Map { resolution: MapResolution::High, color: Color::Green });
});
```

### Clear

`pub struct Clear;` resets every cell in `area`: render it BEFORE a popup, or the earlier widgets show through. It does not wipe what the terminal showed before the first frame: that is `terminal.clear()?`.

```rust
// fragment
frame.render_widget(popup, popup_area);  // WRONG: old content bleeds through
frame.render_widget(Clear, popup_area);  // RIGHT: wipe behind a modal,
frame.render_widget(popup, popup_area);  //   then draw it
```

### Fill

`Fill::new(impl Into<Cow<str>>)` fills an area with a repeated symbol (`.symbol(..)`, `.style(..)`): use it instead of a cell loop.

### Calendar

Feature `widget-calendar` (in default `all-widgets`). `widgets::calendar` module. Takes `time::Date`: add `time = "0.3"` to `Cargo.toml` (ratatui does not re-export it).

```rust
// fragment
Monthly::new(display_date: Date, events: DS)  // DS: DateStyler
.show_surrounding(..)  .show_weekdays_header(..)  .show_month_header(..)  // each takes a style; ALL off by default
.default_style(..)  .block(Block)
trait DateStyler { fn get_style(&self, date: Date) -> Style; }
CalendarEventStore(pub HashMap<Date, Style>)  // ::today(style); .add(date, style)
```

### RatatuiLogo / RatatuiMascot

`RatatuiLogo::tiny()`, `::small()`, `::new(RatatuiLogoSize)` (`Tiny | Small`), `.size(..)`. `RatatuiMascot::new().set_eye(MascotEyeColor)` (`Default | Red`). Both render by value only.

## 13. Macros

Feature `macros` (default). `use ratatui::{macros::*, style::Stylize};`, from `ratatui-macros`. Sugar only: the builder APIs do the same without the feature.

| Macro | Builds | Example |
|---|---|---|
| `span!` | `Span` | `span!("plain")`, `span!("count: {}", n)`, `span!(Style::new().red(); "x")` (style, then `;`) |
| `line!` / `text!` / `row!` | `Line` / `Text` / table `Row` | `line!["hello", "world".bold()]`, `line!["x"; 3]`, `text!["row1", "row2".red()]`, `text!["x"; 2]`, `row!["id", "name"]` |
| `constraint!` | one `Constraint` | `(== 5)` → Length, `(>= 3)` → Min, `(<= 3)` → Max, `(== 10 %)` → Percentage, `(== 1 / 3)` → Ratio, `(*= 1)` → Fill |
| `constraints!` | `[Constraint; N]` | `constraints![== 3, *= 1, == 1]` |
| `vertical!` / `horizontal!` | a `Layout` | `let [top, bottom] = vertical![== 3, *= 1].areas(area);`, `horizontal![>= 10, == 5]` |

## 14. Events / crossterm Re-Export

Ratatui does **not** ship its own event/input system. It re-exports the chosen backend's crate so you read events from there. With the default crossterm backend (crossterm 0.29): `ratatui::crossterm` == the `crossterm` crate (`event`, `terminal`, `cursor`, `style`, ...). `event::read()` blocks until an event arrives (the §3 loop); `event::poll(timeout)?` returns `true` once one is ready. A loop that ticks reads input on a thread or task instead: `app-loop.md`.

- There is no `ratatui::event`: import `ratatui::crossterm::event::{self, Event, KeyCode, KeyEventKind}`.
- Act on a key only when `key.kind == KeyEventKind::Press`: Windows also sends the release, so an unchecked handler runs twice. Edition 2024 (Rust 1.88+) writes the check as one let chain; older editions keep the nested `if`. `clippy::collapsible_if`

```rust
// fragment
if let Event::Key(key) = event::read()? { handle(key.code) }  // WRONG: fires on press AND release
if let Event::Key(key) = event::read()? && key.kind == KeyEventKind::Press { handle(key.code) }  // RIGHT: edition 2024
if let Event::Key(key) = event::read()? {
    if key.kind == KeyEventKind::Press { handle(key.code) }  // RIGHT on older editions
}
```

**Mouse events are opt-in.** `ratatui::init()`/`run()` do not enable mouse capture. Call `ratatui::crossterm::execute!(std::io::stdout(), event::EnableMouseCapture)?` before reading, and `event::DisableMouseCapture` on teardown. Once enabled, clicks/hover/drag arrive as `Event::Mouse(MouseEvent)`.

**Sync vs async event loop.** `event::poll`/`event::read` are blocking/sync. For `tokio::select!`, add a direct `crossterm` dependency at ratatui's version (0.29) with feature `event-stream` and use `ratatui::crossterm::event::EventStream`, a `Stream<Item = io::Result<Event>>`. `Terminal::draw` stays synchronous either way.

**Detecting Shift+Enter / Ctrl+Enter distinctly.** Default terminals send many Ctrl/Shift+key combos as the same bytes as plain keys, so a stock `KeyEvent` can't tell them apart. Needs the Kitty keyboard protocol: `ratatui::crossterm::execute!(std::io::stdout(), event::PushKeyboardEnhancementFlags(event::KeyboardEnhancementFlags::DISAMBIGUATE_ESCAPE_CODES))?` / `event::PopKeyboardEnhancementFlags`, terminal support varies. Push on init, pop on teardown, in the guard that restores the terminal.

## 15. 0.30-Specific Notes: Stale Forms

Each left-hand form is removed (does not compile) or deprecated (warns): write the right-hand form. Stale forms marked `WRONG` or `deprecated` at their API (§1, §4 to §9, §11, §12) are not repeated.

| Stale form | Current form | Since |
|---|---|---|
| `List::start_corner(Corner::..)` | `List::direction(ListDirection::..)` | 0.27 |
| `area.inner(&Margin { .. })` | `area.inner(Margin { .. })` | 0.27 |
| `Padding::zero()` | `Padding::ZERO` | 0.27 |
| `Table::highlight_style` | `row_highlight_style` (+ column/cell variants) | 0.29 |

## 16. Cheat-Sheet: Commonly Hand-Rolled Things ratatui Already Provides

Every row now sits at its API as a `USE THIS` note, a `WRONG`/`RIGHT` pair or the API's own entry: see §3, §5 to §8, §11, §12 and §14.

## 17. Checklist

Run this over your own diff before reporting:

- [ ] Every ratatui name is in this file or was checked in live docs; no stale form from §15 or from a `WRONG` line.
- [ ] Lifecycle: `ratatui::run`, or `init` + `restore` with no `?` between them.
- [ ] One `terminal.draw` per loop pass renders every widget; areas derive from `frame.area()`.
- [ ] Layouts: `Layout::vertical`/`horizontal` + `.areas()` with N = constraint count; the growing region is `Fill`.
- [ ] No hand math on a `Rect` (`inner`, `centered`, `contains`, `positions()`); `right()`/`bottom()` treated as exclusive; content areas via `block.inner(..)`.
- [ ] Every builder setter result is used; borders via `.block(..)`.
- [ ] Stateful widgets: `render_stateful_widget` with a state stored outside `draw`.
- [ ] `Paragraph` wraps where text can overflow and scrolls `(y, x)`; `Chart` axes have bounds; `Gauge` gets `percent` or a 0–1 `ratio`.
- [ ] A popup renders `Clear` first; key handlers check `KeyEventKind::Press` and quit on Ctrl-C.
- [ ] No `deprecated` or `unused_must_use` warning on a ratatui call.

*Private/`pub(crate)` items omitted. Items gated by non-default features are noted inline.*
