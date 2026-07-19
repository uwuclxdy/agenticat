# Ratatui 0.30.x: Public API Reference

> Documented from source tag `ratatui-v0.30.1`; current stable is **0.30.2** (2026-06-19), a
> bug-fix patch with no API changes vs this document (shadow `CellEffect`s now require
> `Send + Sync`; wide-cell diffing and scrollbar-thumb clamp fixes).
> Single source of truth for "what does ratatui give you out of the box". Grep-friendly.

Ratatui 0.30 is a **workspace split into crates**. The `ratatui` umbrella crate re-exports everything;
each item below notes its origin crate. You almost always `use ratatui::...` and never depend on the
sub-crates directly.

| Crate | Role |
|---|---|
| `ratatui` | Umbrella: re-exports + `init`/`restore` helpers + `DefaultTerminal` + `WidgetRef`/`FrameExt` |
| `ratatui-core` | `Terminal`, `Frame`, `Buffer`, `Cell`, `layout`, `style`, `text`, `symbols`, `Widget`/`StatefulWidget`, `Backend` trait, `TestBackend` |
| `ratatui-widgets` | All built-in widgets (`Block`, `Paragraph`, `List`, `Table`, `Chart`, `Canvas`, …) |
| `ratatui-crossterm` | `CrosstermBackend` + crossterm re-export + conversions |
| `ratatui-termion` | `TermionBackend` (feature `termion`) |
| `ratatui-termwiz` | `TermwizBackend` (feature `termwiz`) |
| `ratatui-macros` | `line!`, `span!`, `text!`, `row!`, `constraints!`, `vertical!`, `horizontal!`, `constraint!` (feature `macros`) |

---

## Table of Contents

1. [Top-Level Re-Exports & Prelude](#1-top-level-re-exports--prelude)
2. [Feature Flags](#2-feature-flags)
3. [Terminal Initialization (`ratatui::init` / `DefaultTerminal`)](#3-terminal-initialization)
4. [Terminal & Frame](#4-terminal--frame)
5. [Backend Trait & Backends](#5-backend-trait--backends)
6. [Layout (`Constraint`, `Layout`, `Flex`, `Rect`, …)](#6-layout)
7. [Style (`Style`, `Color`, `Modifier`, `Stylize`)](#7-style)
8. [Text (`Text`, `Line`, `Span`, `Masked`)](#8-text)
9. [Buffer & Cell](#9-buffer--cell)
10. [Symbols](#10-symbols)
11. [Widget Traits (`Widget`, `StatefulWidget`, `WidgetRef`)](#11-widget-traits)
12. [Widgets](#12-widgets)
    - [Block](#block) · [Paragraph](#paragraph) · [List](#list) · [Table](#table) · [Tabs](#tabs)
    - [Gauge / LineGauge](#gauge--linegauge) · [BarChart](#barchart) · [Chart](#chart) · [Sparkline](#sparkline)
    - [Scrollbar](#scrollbar) · [Canvas + Shapes](#canvas--shapes) · [Clear](#clear) · [Fill](#fill)
    - [Calendar](#calendar) · [RatatuiLogo / RatatuiMascot](#ratatuilogo--ratatuimascot)
13. [Macros](#13-macros)
14. [Events / crossterm Re-Export](#14-events--crossterm-re-export)
15. [0.30-Specific Notes (crate split, migrations)](#15-030-specific-notes)
16. [Cheat-Sheet: Commonly Hand-Rolled Things ratatui Already Provides](#16-cheat-sheet-commonly-hand-rolled-things-ratatui-already-provides)

---

## 1. Top-Level Re-Exports & Prelude

`use ratatui::...` exposes (umbrella `lib.rs`):

```rust
// types at crate root
ratatui::{Frame, Terminal, TerminalOptions, Viewport, CompletedFrame};
ratatui::{buffer, layout, style, symbols, text, widgets, backend, init, border, prelude, macros};
ratatui::palette;          // the `palette` crate, re-exported (feature `palette`)
ratatui::crossterm;        // the `crossterm` crate, re-exported (feature `crossterm`)
// init helpers at root (feature `crossterm`):
ratatui::{init, try_init, init_with_options, try_init_with_options, restore, try_restore, run, DefaultTerminal};
```

**Prelude**: `use ratatui::prelude::*;`. Officially de-emphasized (see Issue #1150) but kept for
back-compat. It re-exports the common types + modules:

```rust
use ratatui::prelude::*;
// brings: Backend, backend; CrosstermBackend (feat); Buffer, buffer;
//   layout::{Alignment, Constraint, Direction, HorizontalAlignment, Layout, Margin,
//            Position, Rect, Size, VerticalAlignment};
//   style::{Color, Modifier, Style, Stylize};
//   text::{Line, Masked, Span, Text};
//   widgets::{BlockExt, StatefulWidget, Widget};
//   Frame, Terminal, symbols
```

> The modern idiom (0.30) is to import explicitly (`use ratatui::widgets::Paragraph;`) rather than glob the prelude.

`use ratatui::widgets::*;` exposes every widget type plus traits:

```rust
widgets::{
  Widget, StatefulWidget, BlockExt, FrameExt,
  Bar, BarChart, BarGroup,
  Block, CellEffect, Dimmed, Padding, Shadow, TitlePosition, dimmed,
  BorderType, Borders,
  calendar, canvas,                            // submodules
  Axis, Chart, Dataset, GraphType, LegendPosition,
  Clear, Fill,
  Gauge, LineGauge,
  List, ListDirection, ListItem, ListState,
  RatatuiLogo, RatatuiLogoSize,                // Size re-exported as RatatuiLogoSize
  MascotEyeColor, RatatuiMascot,
  Paragraph, Wrap,
  Scrollbar, ScrollbarOrientation, ScrollbarState, ScrollDirection,
  RenderDirection, Sparkline, SparklineBar,
  Cell, HighlightSpacing, Row, Table, TableState,
  Tabs,
  // feature `unstable-widget-ref`:
  WidgetRef, StatefulWidgetRef,
};
```

---

## 2. Feature Flags

Umbrella `default = ["all-widgets", "crossterm", "layout-cache", "macros", "underline-color"]`.

| Feature | Effect |
|---|---|
| `crossterm` (default) | `CrosstermBackend` + crossterm dep + `std` |
| `crossterm_0_28` / `crossterm_0_29` | pick crossterm minor (0.29 is the default) |
| `termion` / `termwiz` | alternate backends |
| `std` | enable std (implied by any backend) |
| `serde` | (de)serialize style/color types: save themes to file |
| `layout-cache` (default) | cache layout solver results |
| `palette` | `From<palette::*>` conversions into `Color`; re-exports `palette` crate |
| `portable-atomic` | atomics on targets lacking native atomic types |
| `scrolling-regions` | use terminal scroll regions (less flicker in `insert_before`) |
| `macros` (default) | the `ratatui::macros` module (`line!`, `span!`, …) |
| `all-widgets` (default) | = `widget-calendar` |
| `widget-calendar` | `widgets::calendar` (the `Monthly` widget) |
| `underline-color` (default) | backend code for underline color (Crossterm/Termwiz only; not Win7) |
| `unstable` | = all three below |
| `unstable-rendered-line-info` | `Paragraph::line_count` / `line_width` |
| `unstable-widget-ref` | `WidgetRef` / `StatefulWidgetRef` traits + `FrameExt::render_widget_ref` |
| `unstable-backend-writer` | access backend writers |

---

## 3. Terminal Initialization

From `ratatui` umbrella `init` module (feature `crossterm`), all re-exported at crate root.
These handle raw mode + alternate screen + a **panic hook** that restores the terminal automatically.

```rust
pub type DefaultTerminal = Terminal<CrosstermBackend<Stdout>>;

pub fn run<F, R>(f: F) -> R where F: FnOnce(&mut DefaultTerminal) -> R;  // owns setup+teardown
pub fn init() -> DefaultTerminal;                                       // panics on failure
pub fn try_init() -> io::Result<DefaultTerminal>;
pub fn init_with_options(options: TerminalOptions) -> DefaultTerminal;
pub fn try_init_with_options(options: TerminalOptions) -> io::Result<DefaultTerminal>;
pub fn restore();                                                       // best-effort teardown
pub fn try_restore() -> io::Result<()>;
```

**USE THIS instead of hand-rolling** enable_raw_mode + EnterAlternateScreen + a panic hook:

```rust
// Simplest: ratatui owns the lifecycle.
let result = ratatui::run(|terminal| {
    loop {
        terminal.draw(|frame| frame.render_widget("hello", frame.area()))?;
        // ... handle events, break ...
    }
    Ok::<(), std::io::Error>(())
});
```

```rust
// Manual lifecycle (still gets the panic hook + raw mode + alt screen):
let mut terminal = ratatui::init();
// draw loop ...
ratatui::restore();
```

`init()` installs a panic hook that calls `restore()` before the default hook, so a panic mid-draw
won't leave the user's terminal corrupted.

---

## 4. Terminal & Frame

From `ratatui-core::terminal` (re-exported as `ratatui::{Terminal, Frame, TerminalOptions, Viewport, CompletedFrame}`).

### `Terminal<B: Backend>`

```rust
pub fn new(backend: B) -> Result<Self, B::Error>;
pub fn with_options(backend: B, options: TerminalOptions) -> Result<Self, B::Error>;

// Drawing
pub fn draw<F: FnOnce(&mut Frame)>(&mut self, f: F) -> Result<CompletedFrame, B::Error>;
pub fn try_draw<F, E>(&mut self, f: F) -> Result<CompletedFrame, B::Error>
    where F: FnOnce(&mut Frame) -> Result<(), E>, E: Into<B::Error>;
pub fn get_frame(&mut self) -> Frame<'_>;
pub fn current_buffer_mut(&mut self) -> &mut Buffer;
pub fn flush(&mut self) -> Result<(), B::Error>;
pub fn swap_buffers(&mut self);
pub fn clear(&mut self) -> Result<(), B::Error>;
pub fn apply_buffer(&mut self) -> Result<CompletedFrame, B::Error>;
pub fn apply_buffer_with_cursor(&mut self, pos: Option<Position>) -> Result<CompletedFrame, B::Error>;

// Inline (scrollback) rendering
pub fn insert_before<F: FnOnce(&mut Buffer)>(&mut self, height: u16, draw_fn: F) -> Result<(), B::Error>;

// Backend / size
pub fn backend(&self) -> &B;
pub fn backend_mut(&mut self) -> &mut B;
pub fn size(&self) -> Result<Size, B::Error>;
pub fn resize(&mut self, area: Rect) -> Result<(), B::Error>;
pub fn autoresize(&mut self) -> Result<(), B::Error>;

// Cursor
pub fn hide_cursor(&mut self) -> Result<(), B::Error>;
pub fn show_cursor(&mut self) -> Result<(), B::Error>;
pub fn get_cursor_position(&mut self) -> Result<Position, B::Error>;
pub fn set_cursor_position<P: Into<Position>>(&mut self, position: P) -> Result<(), B::Error>;
// (get_cursor/set_cursor (u16,u16) variants exist, prefer the Position ones)
```

### `TerminalOptions` / `Viewport`

```rust
pub struct TerminalOptions { pub viewport: Viewport }

pub enum Viewport {
    Fullscreen,   // default; alternate-screen full-window
    Inline(u16),  // N lines below the cursor, scrolls with output
    Fixed(Rect),  // a fixed rectangle
}
```

```rust
let term = ratatui::init_with_options(TerminalOptions { viewport: Viewport::Inline(8) });
```

### `Frame<'a>`: The Per-Draw Render Handle

```rust
pub fn area(&self) -> Rect;                                  // full drawable area: USE THIS for root layout
pub fn render_widget<W: Widget>(&mut self, widget: W, area: Rect);
pub fn render_stateful_widget<W: StatefulWidget>(&mut self, widget: W, area: Rect, state: &mut W::State);
pub fn set_cursor_position<P: Into<Position>>(&mut self, position: P);  // show a cursor at a cell
pub fn buffer_mut(&mut self) -> &mut Buffer;                 // raw buffer access
pub fn count(&self) -> usize;                               // frame number
```

`CompletedFrame<'a>` is returned by `draw`; carries the rendered `buffer`, `area`, `count`.

> `FrameExt` (feature `unstable-widget-ref`) adds `render_widget_ref` / `render_stateful_widget_ref`.

---

## 5. Backend Trait & Backends

`ratatui::backend` re-exports: `Backend`, `ClearType`, `TestBackend`, `WindowSize`, and (per feature)
`CrosstermBackend`/`TermionBackend`/`TermwizBackend` + their `From*`/`Into*` conversion traits.

### `Backend` Trait (`ratatui-core`)

You rarely implement this; use a provided backend.

```rust
pub trait Backend {
    type Error;
    fn draw<'a, I>(&mut self, content: I) -> Result<(), Self::Error>
        where I: Iterator<Item = (u16, u16, &'a Cell)>;
    fn hide_cursor(&mut self) -> Result<(), Self::Error>;
    fn show_cursor(&mut self) -> Result<(), Self::Error>;
    fn get_cursor_position(&mut self) -> Result<Position, Self::Error>;
    fn set_cursor_position<P: Into<Position>>(&mut self, position: P) -> Result<(), Self::Error>;
    fn clear(&mut self) -> Result<(), Self::Error>;
    fn clear_region(&mut self, clear_type: ClearType) -> Result<(), Self::Error>;
    fn size(&self) -> Result<Size, Self::Error>;
    fn window_size(&mut self) -> Result<WindowSize, Self::Error>;
    fn flush(&mut self) -> Result<(), Self::Error>;
    // provided/default: append_lines, get_cursor, set_cursor, scroll_region_up/down
}

pub enum ClearType { All, AfterCursor, BeforeCursor, CurrentLine, UntilNewLine }
pub struct WindowSize { /* columns_rows: Size, pixels: Size */ }
```

### `CrosstermBackend<W: Write>` (`ratatui-crossterm`)

```rust
pub fn new(writer: W) -> Self;
pub fn writer(&self) -> &W;
pub fn writer_mut(&mut self) -> &mut W;
```

```rust
use ratatui::{Terminal, backend::CrosstermBackend};
let backend = CrosstermBackend::new(std::io::stdout());
let mut terminal = Terminal::new(backend)?;
```

Conversion traits `IntoCrossterm<C>` / `FromCrossterm<C>` bridge ratatui `Color`/`Style`/`Modifier`
to crossterm types (used internally; available if you mix raw crossterm styling).

### `TestBackend` (`ratatui-core`): For Unit Tests

```rust
pub fn new(width: u16, height: u16) -> Self;
pub fn with_lines<'l, L: IntoIterator<Item: Into<Line<'l>>>>(lines: L) -> Self;
pub fn buffer(&self) -> &Buffer;
pub fn resize(&mut self, width: u16, height: u16);
pub fn assert_buffer(&self, expected: &Buffer);
pub fn assert_buffer_lines<'l, L>(&self, expected: L);   // compare to `Line`s
pub fn assert_cursor_position<P: Into<Position>>(&mut self, position: P);
pub fn cursor_visible(&self) -> bool;
pub fn cursor_position(&self) -> Position;
pub fn scrollback(&self) -> &Buffer;                     // captured insert_before output
```

```rust
let backend = TestBackend::new(10, 3);
let mut terminal = Terminal::new(backend)?;
terminal.draw(|f| f.render_widget("hi", f.area()))?;
terminal.backend().assert_buffer_lines(["hi        ", "          ", "          "]);
```

---

## 6. Layout

From `ratatui-core::layout` (`ratatui::layout`).

### `Constraint`

```rust
pub enum Constraint {
    Min(u16),         // at least N cells
    Max(u16),         // at most N cells
    Length(u16),      // exactly N cells (yields if no room)
    Percentage(u16),  // % of available space
    Ratio(u32, u32),  // numerator/denominator of available space
    Fill(u16),        // grow to fill leftover, weighted by the factor
}
impl Constraint {
    pub fn apply(&self, length: u16) -> u16;
    // bulk builders (return Vec<Constraint>):
    pub fn from_lengths<T: IntoIterator<Item=u16>>(lengths: T) -> Vec<Self>;
    pub fn from_mins<T: IntoIterator<Item=u16>>(mins: T) -> Vec<Self>;
    pub fn from_maxes<T: IntoIterator<Item=u16>>(maxes: T) -> Vec<Self>;
    pub fn from_fills<T: IntoIterator<Item=u16>>(factors: T) -> Vec<Self>;
    pub fn from_percentages<T: IntoIterator<Item=u16>>(pcts: T) -> Vec<Self>;
    pub fn from_ratios<T: IntoIterator<Item=(u32,u32)>>(ratios: T) -> Vec<Self>;
}
// From<u16> -> Constraint::Length
```

### `Direction` / `Flex` / `Spacing`

```rust
pub enum Direction { Horizontal, Vertical }
impl Direction { pub const fn perpendicular(self) -> Self; }

pub enum Flex {           // how leftover space is distributed
    Legacy,               // pre-0.26 behaviour (stretch last)
    Start, End, Center,   // pack at an edge / center
    SpaceBetween,         // gaps between items only
    SpaceEvenly,          // equal gaps incl. edges
    SpaceAround,          // half-gaps at edges
}

pub enum Spacing { Space(u16), Overlap(u16) }   // gap or overlap between segments
// From<u16>/From<i16>/From<i32> for Spacing (negative -> Overlap)
```

### `Layout`

```rust
// constructors
pub fn new<I: IntoIterator<Item: Into<Constraint>>>(dir: Direction, c: I) -> Self;
pub fn vertical<I: IntoIterator<Item: Into<Constraint>>>(c: I) -> Self;     // USE THIS
pub fn horizontal<I: IntoIterator<Item: Into<Constraint>>>(c: I) -> Self;   // USE THIS
// builder (all const where possible)
pub const fn direction(self, d: Direction) -> Self;
pub fn constraints<I>(self, c: I) -> Self;
pub const fn margin(self, m: u16) -> Self;
pub const fn horizontal_margin(self, h: u16) -> Self;
pub const fn vertical_margin(self, v: u16) -> Self;
pub const fn flex(self, flex: Flex) -> Self;                    // centering etc.
pub fn spacing<T: Into<Spacing>>(self, s: T) -> Self;
// split (apply to an area)
pub fn areas<const N: usize>(&self, area: Rect) -> [Rect; N];   // USE THIS (fixed count, no Vec)
pub fn try_areas<const N: usize>(&self, area: Rect) -> Result<[Rect; N], _>;
pub fn spacers<const N: usize>(&self, area: Rect) -> [Rect; N]; // the gap rects
pub fn split(&self, area: Rect) -> Rc<[Rect]>;                  // Vec-like (Rects)
pub fn split_with_spacers(&self, area: Rect) -> (Segments, Spacers);
pub fn init_cache(cache_size: NonZeroUsize);                   // optional, defaults to 500
```

**USE THIS instead of hand-rolling** split + index juggling: destructure `areas`:

```rust
use ratatui::layout::{Layout, Constraint};
let [header, body, footer] = Layout::vertical([
    Constraint::Length(3),
    Constraint::Fill(1),     // grows to fill
    Constraint::Length(1),
]).areas(frame.area());
```

**Centering**: don't compute offsets manually, use `Flex::Center`:

```rust
let [area] = Layout::horizontal([Constraint::Length(40)])
    .flex(ratatui::layout::Flex::Center)
    .areas(parent);
```

### `Rect`

```rust
pub const fn new(x: u16, y: u16, width: u16, height: u16) -> Self;
pub const ZERO: Self; pub const MAX: Self;
// geometry
pub const fn area(self) -> u32;
pub const fn is_empty(self) -> bool;
pub const fn left/right/top/bottom(self) -> u16;
pub const fn inner(self, margin: Margin) -> Self;       // shrink by margin: USE THIS for padding
pub const fn outer(self, margin: Margin) -> Self;       // grow
pub fn offset(self, offset: Offset) -> Self;
pub const fn resize(self, size: Size) -> Self;
pub fn union(self, other: Self) -> Self;
pub fn intersection(self, other: Self) -> Self;
pub const fn intersects(self, other: Self) -> bool;
pub const fn contains(self, position: Position) -> bool;
pub fn clamp(self, other: Self) -> Self;
// iteration
pub const fn rows(self) -> Rows;          // iterator of 1-high Rects
pub const fn columns(self) -> Columns;    // iterator of 1-wide Rects
pub const fn positions(self) -> Positions;// iterator of every Position
// conversions
pub const fn as_position(self) -> Position;
pub const fn as_size(self) -> Size;
// centering helpers (USE THESE instead of manual math)
pub fn centered_horizontally(self, c: Constraint) -> Self;
pub fn centered_vertically(self, c: Constraint) -> Self;
pub fn centered(self, h: Constraint, v: Constraint) -> Self;
// layout shortcut
pub fn layout<const N: usize>(self, layout: &Layout) -> [Self; N];
pub fn layout_vec(self, layout: &Layout) -> Vec<Self>;
```

```rust
let popup = frame.area().centered(Constraint::Percentage(60), Constraint::Percentage(40));
```

### `Size`, `Position`, `Offset`, `Margin`, `Alignment`

```rust
pub struct Size { pub width: u16, pub height: u16 }    // new(w,h); area(); ZERO/MAX
pub struct Position { pub x: u16, pub y: u16 }          // new(x,y); ORIGIN; offset(Offset)
pub struct Offset { pub x: i32, pub y: i32 }            // signed; new(x,y); ZERO
pub struct Margin { pub horizontal: u16, pub vertical: u16 }  // new(h,v); From<u16>

pub type Alignment = HorizontalAlignment;               // alias
pub enum HorizontalAlignment { Left, Center, Right }
pub enum VerticalAlignment   { Top, Center, Bottom }
```

`Position`/`Size` convert from/to `(u16,u16)` and from `Rect`; `Offset` supports `Add`/`Sub` with `Position`/`Rect`.

---

## 7. Style

From `ratatui-core::style` (`ratatui::style`).

### `Style`

```rust
pub struct Style {
    pub fg: Option<Color>,
    pub bg: Option<Color>,
    pub underline_color: Option<Color>,  // feature underline-color
    pub add_modifier: Modifier,
    pub sub_modifier: Modifier,
}
pub const fn new() -> Self;          // empty
pub const fn reset() -> Self;        // resets everything
pub const fn fg(self, c: Color) -> Self;
pub const fn bg(self, c: Color) -> Self;
pub const fn underline_color(self, c: Color) -> Self;
pub const fn add_modifier(self, m: Modifier) -> Self;
pub const fn remove_modifier(self, m: Modifier) -> Self;
pub const fn has_modifier(self, m: Modifier) -> bool;
pub fn patch<S: Into<Style>>(self, other: S) -> Self;   // layer styles
// From: Color, (Color,Color), Modifier, and tuples up to (Color,Color,Modifier,Modifier)
```

### `Color`

```rust
pub enum Color {
    Reset,
    Black, Red, Green, Yellow, Blue, Magenta, Cyan, Gray, DarkGray,
    LightRed, LightGreen, LightYellow, LightBlue, LightMagenta, LightCyan, White,
    Rgb(u8, u8, u8),     // 24-bit truecolor
    Indexed(u8),         // 256-color palette index
}
pub const fn from_u32(u: u32) -> Self;   // 0x00RRGGBB
pub fn from_hsl(hsl: palette::Hsl) -> Self;       // feature palette
pub fn from_hsluv(h: palette::Hsluv) -> Self;     // feature palette
// FromStr ("red", "#ff8800", ...); From<[u8;3]>, From<(u8,u8,u8)>, +alpha variants
```

Bundled palettes (constants under `style::palette`):
- `style::palette::tailwind::{SLATE, RED, BLUE, EMERALD, ...}`: each a `Palette` with shade fields.
- `style::palette::material::{RED, BLUE, GRAY, ...}`: Material design swatches.

### `Modifier` (Bitflags)

```rust
pub struct Modifier: u16;   // bitflags
Modifier::{ BOLD, DIM, ITALIC, UNDERLINED, SLOW_BLINK, RAPID_BLINK, REVERSED, HIDDEN, CROSSED_OUT }
```

### `Stylize` Trait: The Ergonomic Shorthand

`Stylize` is implemented for `&str`, `String`, `Cow<str>`, `Span`, `Line`, `Text`, every widget, etc.
It returns the styled value, so you chain it.

```rust
// core methods
fn fg<C: Into<Color>>(self, c: C) -> T;
fn bg<C: Into<Color>>(self, c: C) -> T;
fn reset(self) -> T;
fn add_modifier(self, m: Modifier) -> T;
fn remove_modifier(self, m: Modifier) -> T;
fn style<S: Into<Style>>(self, s: S) -> T;   // set whole style
```

**Generated color shorthands** (foreground + `on_` background):

```
black/red/green/yellow/blue/magenta/cyan/gray/dark_gray/
light_red/light_green/light_yellow/light_blue/light_magenta/light_cyan/white
// + on_black, on_red, ... on_white
```

**Generated modifier shorthands** (each has a `not_` negation):

```
bold/dim/italic/underlined/slow_blink/rapid_blink/reversed/hidden/crossed_out
// + not_bold, not_dim, ...
```

**USE THIS instead of hand-rolling `Style::new().fg(...).add_modifier(...)`:**

```rust
use ratatui::style::Stylize;
let s = "ERROR".red().bold().on_white();        // Span with style
let title = "Title".light_blue().italic();
let warn = Span::raw("careful").yellow().underlined();
// any widget: Block::bordered().blue(); Paragraph::new("x").on_dark_gray();
```

`Styled` trait (low-level): `style()` getter + `set_style()`; `Stylize` is the blanket impl over it.

---

## 8. Text

From `ratatui-core::text` (`ratatui::text`). Hierarchy: `Text` (multi-line) → `Line` (one row of spans) → `Span` (a styled string).

### `Span<'a>`: Styled String Fragment

```rust
pub fn raw<T: Into<Cow<'a,str>>>(content: T) -> Self;
pub fn styled<T: Into<Cow<'a,str>>, S: Into<Style>>(content: T, style: S) -> Self;
pub fn content<T: Into<Cow<'a,str>>>(self, content: T) -> Self;
pub fn style<S: Into<Style>>(self, style: S) -> Self;
pub fn patch_style<S: Into<Style>>(self, style: S) -> Self;
pub fn reset_style(self) -> Self;
pub fn width(&self) -> usize;
pub fn into_centered_line(self) -> Line<'a>;   // + left/right aligned variants
// From<&str>, From<String>, From<Cow<str>>; Add<Span> -> Line; Stylize; Widget
```

### `Line<'a>`: One Terminal Row, a `Vec<Span>` + Alignment

```rust
pub fn raw<T: Into<Cow<'a,str>>>(content: T) -> Self;
pub fn styled<T, S>(content: T, style: S) -> Self;
pub fn spans<I: IntoIterator<Item: Into<Span<'a>>>>(self, spans: I) -> Self;
pub fn style<S: Into<Style>>(self, style: S) -> Self;
pub fn alignment(self, a: Alignment) -> Self;
pub fn left_aligned(self) -> Self;
pub fn centered(self) -> Self;            // USE THIS for centered titles/lines
pub fn right_aligned(self) -> Self;
pub fn width(&self) -> usize;
pub fn patch_style<S: Into<Style>>(self, s: S) -> Self;
pub fn push_span<T: Into<Span<'a>>>(&mut self, span: T);
pub fn iter(&self) -> impl Iterator<Item=&Span>;
// From<&str>, From<String>, From<Span>, From<Vec<Span>>; Add<Span>, Add<Line>; Widget; Stylize
```

### `Text<'a>`: Multi-Line Block, a `Vec<Line>`

```rust
pub fn raw<T: Into<Cow<'a,str>>>(content: T) -> Self;     // splits on '\n'
pub fn styled<T, S>(content: T, style: S) -> Self;
pub fn style<S: Into<Style>>(self, style: S) -> Self;
pub fn alignment(self, a: Alignment) -> Self;
pub fn left_aligned/centered/right_aligned(self) -> Self;
pub fn width(&self) -> usize;
pub const fn height(&self) -> usize;
pub fn push_line<T: Into<Line<'a>>>(&mut self, line: T);
pub fn push_span<T: Into<Span<'a>>>(&mut self, span: T);
// From<&str>/<String>/<Span>/<Line>/<Vec<Line>>; Add; Widget; Stylize
```

### `Masked<'a>`: Render a String as Repeated Mask Chars

```rust
pub fn new(s: impl Into<Cow<'a,str>>, mask_char: char) -> Self;
pub fn mask_char(&self) -> char;
pub fn value(&self) -> Cow<'a, str>;
// Into<Text>, Into<Cow<str>>  (e.g. password fields)
```

**USE THESE `From`/builder ergonomics instead of hand-constructing structs:**

```rust
let line: Line = "plain text".into();                  // From<&str>
let line = Line::from(vec!["a".red(), " b".green()]);   // From<Vec<Span>>
let title = Line::from("Title").centered().bold();
let text: Text = "line1\nline2".into();                 // auto-splits newlines
let span: Span = "hi".bold().into();
```

`ToLine` / `ToSpan` / `ToText` traits give `.to_line()` / `.to_span()` / `.to_text()` on any `Display`.
`StyledGrapheme<'a>` is the per-grapheme styled unit produced by `styled_graphemes()`.

---

## 9. Buffer & Cell

From `ratatui-core::buffer` (`ratatui::buffer`). The buffer is the 2-D grid of `Cell`s the terminal diffs.

### `Buffer`

```rust
pub fn empty(area: Rect) -> Self;
pub fn filled(area: Rect, cell: Cell) -> Self;
pub fn with_lines<'a, I: IntoIterator<Item: Into<Line<'a>>>>(lines: I) -> Self;  // tests
pub fn area(&self) -> &Rect;
pub fn content(&self) -> &[Cell];
// cell access
pub fn cell<P: Into<Position>>(&self, pos: P) -> Option<&Cell>;
pub fn cell_mut<P: Into<Position>>(&mut self, pos: P) -> Option<&mut Cell>;
// also: buf[Position] / buf[(x,y)] via Index/IndexMut
// writing
pub fn set_string<T: AsRef<str>, S: Into<Style>>(&mut self, x: u16, y: u16, s: T, style: S);
pub fn set_stringn<...>(&mut self, x, y, s, max_width, style) -> (u16, u16);
pub fn set_line(&mut self, x: u16, y: u16, line: &Line, max_width: u16) -> (u16, u16);
pub fn set_span(&mut self, x: u16, y: u16, span: &Span, max_width: u16) -> (u16, u16);
pub fn set_style<S: Into<Style>>(&mut self, area: Rect, style: S);
// lifecycle
pub fn resize(&mut self, area: Rect);
pub fn reset(&mut self);
pub fn merge(&mut self, other: &Self);
pub fn diff<'a>(&self, other: &'a Self) -> Vec<(u16, u16, &'a Cell)>;
pub fn diff_iter<'p,'n>(&'p self, other: &'n Self) -> BufferDiff<'p,'n>;  // lazy
```

### `Cell`

```rust
pub const EMPTY: Self;
pub const fn new(symbol: &'static str) -> Self;
pub fn symbol(&self) -> &str;
pub fn set_symbol(&mut self, s: &str) -> &mut Self;
pub fn set_char(&mut self, c: char) -> &mut Self;
pub const fn set_fg(&mut self, c: Color) -> &mut Self;
pub const fn set_bg(&mut self, c: Color) -> &mut Self;
pub fn set_style<S: Into<Style>>(&mut self, s: S) -> &mut Self;
pub const fn style(&self) -> Style;
pub const fn set_skip(&mut self, skip: bool) -> &mut Self;        // skip in diff
pub const fn set_diff_option(&mut self, o: CellDiffOption) -> &mut Self;
pub fn reset(&mut self);
// From<char>; CellDiffOption { None, Skip, AlwaysUpdate, ForcedWidth(NonZeroU16) }
```

Custom-widget direct writing:

```rust
fn render(self, area: Rect, buf: &mut Buffer) {
    buf.set_string(area.x, area.y, "X", Style::new().red());
    if let Some(c) = buf.cell_mut((area.x, area.y)) { c.set_bg(Color::Blue); }
}
```

---

## 10. Symbols

From `ratatui-core::symbols` (`ratatui::symbols`). String/char constants + `Set` structs used by widgets.

| Module | Contents |
|---|---|
| `symbols::border` | `Set` + `PLAIN, ROUNDED, DOUBLE, THICK, *_DASHED, QUADRANT_*, ONE_EIGHTH_*, PROPORTIONAL_*, FULL, EMPTY` |
| `symbols::line` | `Set` + `NORMAL, ROUNDED, DOUBLE, THICK, *_DASHED`; raw glyphs `VERTICAL, HORIZONTAL, CROSS, TOP_LEFT, ...` |
| `symbols::block` | `FULL, SEVEN_EIGHTHS … ONE_EIGHTH`; `Set` + `THREE_LEVELS, NINE_LEVELS` |
| `symbols::bar` | same eighths as block; `Set` + `THREE_LEVELS, NINE_LEVELS` (sparkline/barchart) |
| `symbols::braille` | `BRAILLE: [char; 256]` (canvas Braille marker) |
| `symbols::half_block` | `UPPER='▀'`, `LOWER='▄'`, `FULL='█'` |
| `symbols::shade` | `EMPTY, LIGHT, MEDIUM, DARK, FULL` |
| `symbols::scrollbar` | `Set` + `VERTICAL, HORIZONTAL, DOUBLE_VERTICAL, DOUBLE_HORIZONTAL` |
| `symbols::pixel` | `QUADRANTS[16]`, `SEXTANTS[64]`, `OCTANTS[256]` (high-density canvas) |
| `symbols::merge` | `MergeStrategy { Replace, Exact, Fuzzy }` for border-joining |
| `symbols::Marker` | canvas/braille marker (see below) |

### `Marker` (Re-Exported as `symbols::Marker`)

```rust
pub enum Marker { Dot, Block, Bar, Braille, HalfBlock, Quadrant, Sextant, Octant, Custom(char) }
```

Used by `Canvas::marker(...)` and `Dataset::marker(...)`. `Braille` = highest resolution.

```rust
use ratatui::widgets::Block;
use ratatui::symbols;
let b = Block::bordered().border_set(symbols::border::ROUNDED);
```

---

## 11. Widget Traits

From `ratatui-core::widgets` (`Widget`, `StatefulWidget`) and `ratatui::widgets` (`WidgetRef`, `StatefulWidgetRef`, `BlockExt`, `FrameExt`).

### `Widget`

```rust
pub trait Widget {
    fn render(self, area: Rect, buf: &mut Buffer) where Self: Sized;
}
```

Built-in blanket impls: `Widget for &str`, `for String`, `for Option<W: Widget>`.

**0.30 pattern: implement `Widget for &T` (not `WidgetRef`)** so the widget can render by reference
without consuming itself. Every built-in widget implements both `Widget for T` and `Widget for &T`:

```rust
struct Greeting { name: String }
impl Widget for &Greeting {                       // render by ref: the modern idiom
    fn render(self, area: Rect, buf: &mut Buffer) {
        buf.set_string(area.x, area.y, format!("Hi {}", self.name), Style::new());
    }
}
// usage: frame.render_widget(&greeting, area);   // greeting not moved
```

### `StatefulWidget`

```rust
pub trait StatefulWidget {
    type State: ?Sized;
    fn render(self, area: Rect, buf: &mut Buffer, state: &mut Self::State);
}
```

Used by `List` (`ListState`), `Table` (`TableState`), `Scrollbar` (`ScrollbarState`). Render via
`frame.render_stateful_widget(widget, area, &mut state)`.

### `WidgetRef` / `StatefulWidgetRef`: Feature `unstable-widget-ref`

```rust
pub trait WidgetRef { fn render_ref(&self, area: Rect, buf: &mut Buffer); }
pub trait StatefulWidgetRef {
    type State;
    fn render_ref(&self, area: Rect, buf: &mut Buffer, state: &mut Self::State);
}
```

> **Deprecated direction in 0.30.** These are gated behind `unstable-widget-ref` and are being replaced
> by the `Widget for &T` pattern. Prefer `impl Widget for &MyWidget`. Use `WidgetRef` only if you need
> trait-object boxing (`Box<dyn WidgetRef>`). `FrameExt::render_widget_ref` exists for these.

---

## 12. Widgets

All from `ratatui-widgets`, re-exported under `ratatui::widgets`. Every widget implements
`Widget` + `Widget for &T` (and `Styled`/`Stylize`); stateful ones add `StatefulWidget`.

### Block

```rust
pub struct Block<'a>;
pub const fn new() -> Self;
pub const fn bordered() -> Self;                  // USE THIS = new().borders(Borders::ALL)
pub fn title<T: Into<Line<'a>>>(self, t: T) -> Self;
pub fn title_top<T: Into<Line<'a>>>(self, t: T) -> Self;
pub fn title_bottom<T: Into<Line<'a>>>(self, t: T) -> Self;
pub fn title_style<S: Into<Style>>(self, s: S) -> Self;
pub const fn title_alignment(self, a: Alignment) -> Self;
pub const fn title_position(self, p: TitlePosition) -> Self;   // Top | Bottom
pub fn border_style<S: Into<Style>>(self, s: S) -> Self;
pub fn style<S: Into<Style>>(self, s: S) -> Self;
pub const fn borders(self, flags: Borders) -> Self;
pub const fn border_type(self, t: BorderType) -> Self;
pub const fn border_set(self, set: border::Set<'a>) -> Self;
pub const fn padding(self, p: Padding) -> Self;
pub const fn merge_borders(self, strategy: MergeStrategy) -> Self;
pub fn shadow(self, shadow: Shadow) -> Self;
pub fn inner(&self, area: Rect) -> Rect;          // the content area inside borders/padding

pub enum TitlePosition { Top, Bottom }
pub struct Borders: u8;   // bitflags: NONE, TOP, RIGHT, BOTTOM, LEFT, ALL
pub enum BorderType {
    Plain, Rounded, Double, Thick,
    LightDoubleDashed, HeavyDoubleDashed, LightTripleDashed, HeavyTripleDashed,
    LightQuadrupleDashed, HeavyQuadrupleDashed, QuadrantInside, QuadrantOutside,
}
```

Use the title-side helpers + `bordered()`:

```rust
use ratatui::widgets::{Block, BorderType};
let block = Block::bordered()
    .title("Top Left")
    .title_top(Line::from("Top Right").right_aligned())
    .title_bottom(Line::from("status").centered())
    .border_type(BorderType::Rounded)
    .padding(Padding::uniform(1));
let content_area = block.inner(area);
```

#### `Padding`

```rust
pub const ZERO: Self;
pub const fn new(left, right, top, bottom: u16) -> Self;
pub const fn uniform(v: u16) -> Self;        // all sides
pub const fn horizontal(v) / vertical(v) -> Self;
pub const fn symmetric(x, y: u16) -> Self;
pub const fn left/right/top/bottom(v: u16) -> Self;
pub const fn proportional(v: u16) -> Self;
// From<u16>
```

`Shadow` (block drop-shadow): `Shadow::overlay()/block()/light_shade()/medium_shade()/dark_shade()`,
`.style(...)`, `.offset(Offset)`; custom via `Shadow::custom(impl CellEffect)`. `dimmed()` → `Dimmed` effect.

### Paragraph

```rust
pub fn new<T: Into<Text<'a>>>(text: T) -> Self;
pub fn block(self, block: Block<'a>) -> Self;
pub fn style<S: Into<Style>>(self, s: S) -> Self;
pub const fn wrap(self, wrap: Wrap) -> Self;
pub const fn scroll(self, offset: (u16, u16)) -> Self;   // (vertical, horizontal)
pub const fn alignment(self, a: Alignment) -> Self;
pub const fn left_aligned/centered/right_aligned(self) -> Self;
pub fn line_count(&self, width: u16) -> usize;     // feature unstable-rendered-line-info
pub fn line_width(&self) -> usize;                 // feature unstable-rendered-line-info

pub struct Wrap { pub trim: bool }                 // trim leading whitespace on wrap
```

```rust
let p = Paragraph::new("long body text...")
    .block(Block::bordered().title("Notes"))
    .wrap(Wrap { trim: true })
    .scroll((scroll_y, 0));
```

### List

```rust
pub fn new<T: IntoIterator<Item: Into<ListItem<'a>>>>(items: T) -> Self;
pub fn items<T>(self, items: T) -> Self;
pub fn block(self, b: Block<'a>) -> Self;
pub fn style<S: Into<Style>>(self, s: S) -> Self;
pub fn highlight_symbol<L: Into<Line<'a>>>(self, sym: L) -> Self;   // e.g. ">> "
pub fn highlight_style<S: Into<Style>>(self, s: S) -> Self;
pub const fn repeat_highlight_symbol(self, repeat: bool) -> Self;   // on multi-line items
pub const fn highlight_spacing(self, v: HighlightSpacing) -> Self;
pub const fn direction(self, d: ListDirection) -> Self;            // TopToBottom | BottomToTop
pub const fn scroll_padding(self, padding: usize) -> Self;         // keep N rows visible around selection
pub const fn len(&self) -> usize;

pub struct ListItem<'a>;   // new<T: Into<Text>>(content); .style(s); .height(); .width()
pub enum ListDirection { TopToBottom, BottomToTop }
pub enum HighlightSpacing { Always, WhenSelected, Never }   // reserve gutter for highlight symbol
```

`ListState` (stateful):

```rust
pub const fn with_offset(self, offset: usize) -> Self;
pub const fn with_selected(self, selected: Option<usize>) -> Self;
pub const fn selected(&self) -> Option<usize>;
pub const fn select(&mut self, index: Option<usize>);
pub fn select_next/select_previous(&mut self);
pub const fn select_first/select_last(&mut self);
pub fn scroll_down_by/scroll_up_by(&mut self, amount: u16);
```

```rust
let list = List::new(["a", "b", "c"])
    .block(Block::bordered())
    .highlight_symbol(">> ")
    .highlight_style(Style::new().reversed())
    .highlight_spacing(HighlightSpacing::Always);
frame.render_stateful_widget(list, area, &mut state);   // state: ListState
```

### Table

```rust
pub fn new<R, C>(rows: R, widths: C) -> Self
    where R: IntoIterator<Item: Into<Row<'a>>>, C: IntoIterator<Item: Into<Constraint>>;
pub fn rows<T: IntoIterator<Item=Row<'a>>>(self, rows: T) -> Self;
pub fn header(self, h: Row<'a>) -> Self;
pub fn footer(self, f: Row<'a>) -> Self;
pub fn widths<I: IntoIterator<Item: Into<Constraint>>>(self, w: I) -> Self;
pub const fn column_spacing(self, spacing: u16) -> Self;
pub fn block(self, b: Block<'a>) -> Self;
pub fn style<S: Into<Style>>(self, s: S) -> Self;
pub fn row_highlight_style<S: Into<Style>>(self, s: S) -> Self;
pub fn column_highlight_style<S: Into<Style>>(self, s: S) -> Self;
pub fn cell_highlight_style<S: Into<Style>>(self, s: S) -> Self;
pub fn highlight_symbol<T: Into<Text<'a>>>(self, sym: T) -> Self;
pub const fn highlight_spacing(self, v: HighlightSpacing) -> Self;
pub const fn flex(self, flex: Flex) -> Self;        // distribute leftover column space

pub struct Row<'a>;    // new<T: IntoIterator<Item: Into<Cell>>>(cells); .height(u16);
                       // .top_margin/.bottom_margin(u16); .style(s)
pub struct Cell<'a>;   // new<T: Into<Text>>(content); .content(t); .column_span(u16); .style(s)
```

`TableState`: like `ListState` plus column/cell selection: `select_column`, `select_cell`,
`with_selected_cell`, `selected_column`, `selected_cell`, `scroll_right_by/left_by`, etc.

```rust
let table = Table::new(
        vec![Row::new(["1", "Alice"]), Row::new(["2", "Bob"])],
        [Constraint::Length(3), Constraint::Fill(1)],
    )
    .header(Row::new(["ID", "Name"]).bold())
    .row_highlight_style(Style::new().reversed())
    .highlight_symbol(">");
frame.render_stateful_widget(table, area, &mut table_state);
```

### Tabs

```rust
pub fn new<I: IntoIterator<Item: Into<Line<'a>>>>(titles: I) -> Self;
pub fn select<T: Into<Option<usize>>>(self, selected: T) -> Self;
pub fn block(self, b: Block<'a>) -> Self;
pub fn style<S: Into<Style>>(self, s: S) -> Self;
pub fn highlight_style<S: Into<Style>>(self, s: S) -> Self;
pub fn divider<T: Into<Span<'a>>>(self, d: T) -> Self;
pub fn padding<T,U>(self, left: T, right: U) -> Self;     // + padding_left / padding_right
```

### Gauge / LineGauge

```rust
// Gauge (block bar with % label)
pub fn percent(self, percent: u16) -> Self;          // 0..=100
pub fn ratio(self, ratio: f64) -> Self;              // 0.0..=1.0
pub fn label<T: Into<Span<'a>>>(self, l: T) -> Self;
pub fn gauge_style<S: Into<Style>>(self, s: S) -> Self;
pub const fn use_unicode(self, b: bool) -> Self;     // sub-cell resolution
pub fn block(self, b: Block<'a>) -> Self;

// LineGauge (single-line progress)
pub fn ratio(self, ratio: f64) -> Self;
pub const fn line_set(self, set: symbols::line::Set<'a>) -> Self;
pub const fn filled_symbol(self, s: &'a str) -> Self;
pub const fn unfilled_symbol(self, s: &'a str) -> Self;
pub fn filled_style<S: Into<Style>>(self, s: S) -> Self;
pub fn unfilled_style<S: Into<Style>>(self, s: S) -> Self;
pub fn label<T: Into<Line<'a>>>(self, l: T) -> Self;
```

```rust
let g = Gauge::default().ratio(0.42).gauge_style(Style::new().green()).use_unicode(true);
```

### BarChart

```rust
pub fn new<T: Into<Vec<Bar<'a>>>>(bars: T) -> Self;
pub fn vertical(bars: impl Into<Vec<Bar<'a>>>) -> Self;
pub fn horizontal(bars: impl Into<Vec<Bar<'a>>>) -> Self;
pub fn grouped<T: Into<Vec<BarGroup<'a>>>>(groups: T) -> Self;
pub fn data(self, data: impl Into<BarGroup<'a>>) -> Self;     // From<&[(&str,u64)]>
pub const fn max(self, max: u64) -> Self;
pub const fn bar_width(self, w: u16) -> Self;
pub const fn bar_gap(self, gap: u16) -> Self;
pub const fn group_gap(self, gap: u16) -> Self;
pub const fn bar_set(self, set: symbols::bar::Set<'a>) -> Self;
pub fn bar_style/value_style/label_style<S: Into<Style>>(self, s: S) -> Self;
pub const fn direction(self, d: Direction) -> Self;
pub fn block(self, b: Block<'a>) -> Self;

// Bar:  new(value)/with_label(label, value); .value(u64); .label(Line); .style; .value_style; .text_value(String)
// BarGroup: new(bars)/with_label(label, bars); .label; .bars(&[Bar])
```

```rust
let bc = BarChart::default()
    .data(&[("Mon", 5), ("Tue", 8), ("Wed", 3)])   // From<&[(&str,u64)]>
    .bar_width(5).bar_gap(1).max(10);
```

### Chart

```rust
pub fn new(datasets: Vec<Dataset<'a>>) -> Self;
pub fn block(self, b: Block<'a>) -> Self;
pub fn x_axis(self, axis: Axis<'a>) -> Self;
pub fn y_axis(self, axis: Axis<'a>) -> Self;
pub const fn hidden_legend_constraints(self, c: (Constraint, Constraint)) -> Self;
pub const fn legend_position(self, p: Option<LegendPosition>) -> Self;
pub fn style<S: Into<Style>>(self, s: S) -> Self;

// Axis: .title(Line); .bounds([f64;2]); .labels(iter of Line); .style; .labels_alignment(Alignment)
// Dataset: .name(Line); .data(&[(f64,f64)]); .marker(symbols::Marker);
//          .graph_type(GraphType); .style; .fill_to_y(f64)
pub enum GraphType { Scatter, Line, Bar, Area }
pub enum LegendPosition { Top, TopRight, TopLeft, Left, Right, Bottom, BottomRight, BottomLeft }
```

```rust
let data = [(0.0, 0.0), (1.0, 1.0), (2.0, 0.5)];
let ds = Dataset::default().name("series").data(&data)
    .marker(symbols::Marker::Braille).graph_type(GraphType::Line).cyan();
let chart = Chart::new(vec![ds])
    .x_axis(Axis::default().bounds([0.0, 2.0]).labels(["0", "2"]))
    .y_axis(Axis::default().bounds([0.0, 1.0]).labels(["0", "1"]));
```

### Sparkline

```rust
pub fn data<T: IntoIterator<Item: Into<SparklineBar>>>(self, data: T) -> Self;
pub const fn max(self, max: u64) -> Self;
pub const fn bar_set(self, set: symbols::bar::Set<'a>) -> Self;
pub const fn direction(self, d: RenderDirection) -> Self;     // LeftToRight | RightToLeft
pub fn style<S: Into<Style>>(self, s: S) -> Self;
pub fn absent_value_style<S: Into<Style>>(self, s: S) -> Self;
pub fn absent_value_symbol(self, sym: impl Into<String>) -> Self;
pub fn block(self, b: Block<'a>) -> Self;
// SparklineBar: From<u64>, From<Option<u64>> (None = absent); .style(Option<Style>)
pub enum RenderDirection { LeftToRight, RightToLeft }
```

```rust
let sl = Sparkline::default().data([1u64, 4, 2, 8, 5, 3]).max(8).green();
```

### Scrollbar

```rust
pub const fn new(orientation: ScrollbarOrientation) -> Self;
pub const fn orientation(self, o: ScrollbarOrientation) -> Self;
pub const fn thumb_symbol(self, s: &'a str) -> Self;
pub fn thumb_style<S: Into<Style>>(self, s: S) -> Self;
pub const fn track_symbol(self, s: Option<&'a str>) -> Self;
pub fn track_style<S: Into<Style>>(self, s: S) -> Self;
pub const fn begin_symbol(self, s: Option<&'a str>) -> Self;   // + begin_style
pub const fn end_symbol(self, s: Option<&'a str>) -> Self;     // + end_style
pub const fn symbols(self, set: symbols::scrollbar::Set<'a>) -> Self;
pub fn style<S: Into<Style>>(self, s: S) -> Self;

pub enum ScrollbarOrientation { VerticalRight, VerticalLeft, HorizontalBottom, HorizontalTop }
pub enum ScrollDirection { Forward, Backward }
```

`ScrollbarState` (stateful):

```rust
pub const fn new(content_length: usize) -> Self;
pub const fn position(self, p: usize) -> Self;
pub const fn content_length(self, n: usize) -> Self;
pub const fn viewport_content_length(self, n: usize) -> Self;
pub const fn prev(&mut self);  pub fn next(&mut self);
pub const fn first/last(&mut self);
pub fn scroll(&mut self, direction: ScrollDirection);
pub const fn get_position(&self) -> usize;
```

```rust
let sb = Scrollbar::new(ScrollbarOrientation::VerticalRight)
    .begin_symbol(Some("↑")).end_symbol(Some("↓"));
frame.render_stateful_widget(sb, area, &mut scrollbar_state);
```

### Canvas + Shapes

`widgets::canvas` module. Draw arbitrary 2-D shapes onto a Braille/half-block/quadrant grid.

```rust
// Canvas<'a, F: Fn(&mut Context)>
Canvas::default()
    .block(block)
    .x_bounds([f64; 2]).y_bounds([f64; 2])
    .marker(symbols::Marker::Braille)
    .background_color(Color)
    .paint(|ctx| { /* ctx.draw(&shape); ctx.print(x, y, line); ctx.layer(); */ });

// Context methods: draw(&impl Shape), print(x,y, Into<Line>), layer(), marker(m)
// Painter (low-level inside a Shape::draw): get_point(x,y), paint(x,y,Color), bounds()
```

Shapes (`canvas::*`, all implement `Shape`):

```rust
Line::new(x1, y1, x2, y2, color);
FilledLine::new(x1, y1, x2, y2, fill_to_y, color);
Rectangle::new(x, y, width, height, color);
Circle::new(x, y, radius, color);
Points::new(coords: &[(f64,f64)], color);
Map { resolution: MapResolution, color }   // MapResolution { Low, High }: world map outline
Label<'a>                                   // a positioned text label
```

```rust
use ratatui::widgets::canvas::{Canvas, Circle, Map, MapResolution};
let canvas = Canvas::default()
    .x_bounds([-180.0, 180.0]).y_bounds([-90.0, 90.0])
    .paint(|ctx| {
        ctx.draw(&Map { resolution: MapResolution::High, color: Color::Green });
        ctx.draw(&Circle { x: 0.0, y: 0.0, radius: 10.0, color: Color::Red });
    });
```

### Clear

```rust
pub struct Clear;   // resets every cell in `area`: render BEFORE a popup
```

```rust
frame.render_widget(Clear, popup_area);     // wipe behind a modal
frame.render_widget(popup, popup_area);
```

### Fill

```rust
pub fn new<S: Into<Cow<'a,str>>>(symbol: S) -> Self;   // fill area with a repeated symbol
pub fn symbol<S: Into<Cow<'a,str>>>(self, s: S) -> Self;
pub fn style<S: Into<Style>>(self, s: S) -> Self;
```

### Calendar

Feature `widget-calendar` (in default `all-widgets`). `widgets::calendar` module. Backed by the `time` crate (`time::Date`).

```rust
pub struct Monthly<'a, DS: DateStyler>;
pub const fn new(display_date: Date, events: DS) -> Self;
pub fn show_surrounding<S: Into<Style>>(self, s: S) -> Self;
pub fn show_weekdays_header<S: Into<Style>>(self, s: S) -> Self;
pub fn show_month_header<S: Into<Style>>(self, s: S) -> Self;
pub fn default_style<S: Into<Style>>(self, s: S) -> Self;
pub fn block(self, b: Block<'a>) -> Self;

pub trait DateStyler { /* style(&self, date) -> Style */ }
pub struct CalendarEventStore(pub HashMap<Date, Style>);
//   CalendarEventStore::today(style); .add(date, style)
```

### RatatuiLogo / RatatuiMascot

```rust
// RatatuiLogo (text logo)
pub const fn new(size: RatatuiLogoSize) -> Self;   // Size { Tiny, Small } -> re-exported as RatatuiLogoSize
pub const fn tiny() -> Self;
pub const fn small() -> Self;
pub const fn size(self, size: Size) -> Self;

// RatatuiMascot (the rat)
pub fn new() -> Self;
pub const fn set_eye(self, color: MascotEyeColor) -> Self;   // Default | Red
```

```rust
frame.render_widget(RatatuiLogo::tiny(), area);
```

---

## 13. Macros

Feature `macros` (default). `use ratatui::macros::*;`, from `ratatui-macros`.

| Macro | Builds | Example |
|---|---|---|
| `span!` | `Span` | `span!("plain")`, `span!("count: {}", n)`, `span!(Style::new().red(); "x")` (style, then `;`) |
| `line!` | `Line` | `line!["hello", "world".bold()]`, `line!["x"; 3]` |
| `text!` | `Text` | `text!["row1", "row2".red()]`, `text!["x"; 2]` |
| `row!` | table `Row` | `row!["id", "name"]` |
| `constraint!` | one `Constraint` | `constraint!(== 5)` → Length, `constraint!(>= 3)` → Min, `constraint!(<= 3)` → Max, `constraint!(== 10 %)` → Percentage, `constraint!(== 1 / 3)` → Ratio, `constraint!(*= 1)` → Fill |
| `constraints!` | `[Constraint; N]` | `constraints![== 3, *= 1, == 1]` |
| `vertical!` | vertical `Layout` | `vertical![== 3, *= 1]` |
| `horizontal!` | horizontal `Layout` | `horizontal![>= 10, == 5]` |

Operator legend: `==` Length, `== N %` Percentage, `== a / b` Ratio, `>=` Min, `<=` Max, `*=` Fill.

```rust
use ratatui::macros::{line, vertical};
let line = line!["hello".red(), " world".bold()];
let [top, bottom] = vertical![== 3, *= 1].areas(frame.area());   // Length(3), Fill(1)
```

> The macros are sugar; the builder APIs (`Line::from`, `Layout::vertical`, `Constraint::Length`) do
> the same thing without the feature.

---

## 14. Events / crossterm Re-Export

Ratatui does **not** ship its own event/input system. It re-exports the chosen backend's crate so you
read events from there. With the default crossterm backend (crossterm 0.29):

```rust
ratatui::crossterm;   // == the `crossterm` crate (event, terminal, cursor, style, ...)
```

```rust
use ratatui::crossterm::event::{self, Event, KeyCode, KeyEventKind};

if event::poll(std::time::Duration::from_millis(50))? {
    if let Event::Key(key) = event::read()? {
        if key.kind == KeyEventKind::Press && key.code == KeyCode::Char('q') {
            // quit
        }
    }
}
```

Backend-specific style bridges: `IntoCrossterm`/`FromCrossterm` (and termion/termwiz equivalents)
convert ratatui `Color`/`Style`/`Modifier` to the backend's types.

**Mouse events are opt-in.** `ratatui::init()`/`run()` do not enable mouse capture. Call
`crossterm::execute!(stdout, event::EnableMouseCapture)` before reading, and
`event::DisableMouseCapture` on teardown. Once enabled, clicks/hover/drag arrive as
`Event::Mouse(MouseEvent)`.

**Sync vs async event loop.** `event::poll`/`event::read` above are blocking/sync. For
`tokio::select!` over crossterm events plus other async streams, enable crossterm's
`event-stream` feature and use `crossterm::event::EventStream`, a
`Stream<Item = io::Result<Event>>`. `Terminal::draw` itself stays synchronous either way.

**Detecting Shift+Enter / Ctrl+Enter distinctly.** Default terminals collapse many Ctrl/Shift+key
combos to identical bytes as plain keys, so a stock `KeyEvent` can't tell them apart. Needs the
Kitty keyboard protocol: `crossterm::execute!(stdout, PushKeyboardEnhancementFlags(..))` /
`PopKeyboardEnhancementFlags`, terminal support varies. Push on init, pop on teardown, paired
with the same guard that restores the terminal.

---

## 15. 0.30-Specific Notes

- **Workspace crate split.** `ratatui` is now an umbrella over `ratatui-core`, `ratatui-widgets`,
  `ratatui-crossterm`/`-termion`/`-termwiz`, and `ratatui-macros`. Keep depending only on `ratatui`;
  the split is transparent through re-exports.
- **`ratatui::init()` / `restore()` / `run()` + `DefaultTerminal`.** The blessed lifecycle. `init()`
  enables raw mode + alternate screen and installs a panic hook that restores the terminal. `run()`
  wraps a whole closure. No more hand-written `enable_raw_mode()` + `execute!(EnterAlternateScreen)`.
- **`Widget for &T` is the migration target away from `WidgetRef`.** Implement `impl Widget for &MyWidget`
  to render by reference. `WidgetRef`/`StatefulWidgetRef` are gated behind `unstable-widget-ref` and on
  the way out (keep them only for `Box<dyn WidgetRef>` trait objects). `FrameExt::render_widget_ref`
  is the method for those.
- **`Flex`** controls leftover-space distribution in `Layout` (`Start/End/Center/SpaceBetween/SpaceEvenly/SpaceAround`,
  plus `Legacy`). `Table::flex` exposes the same for columns. `Rect::centered*` are convenience wrappers.
- **`Constraint::Fill(weight)`**: proportional grow constraint (use instead of `Min(0)` hacks).
- **`Layout::areas::<N>()`** returns a fixed `[Rect; N]` you can destructure; `split()` returns the
  `Rc<[Rect]>`-backed `Rects`. Prefer `areas`.
- **HorizontalAlignment / VerticalAlignment** split out; `Alignment` is now an alias for
  `HorizontalAlignment`.
- **Border dashing + merging.** Many new `BorderType` dashed variants and `Block::merge_borders`
  (`MergeStrategy`) for joining adjacent block borders. `Block::shadow` adds drop shadows.
- **High-density canvas markers**: `Marker::{Quadrant, Sextant, Octant}` (alongside `Braille`, `HalfBlock`).
- **Backend writer pin**: crossterm 0.29 is default; `crossterm_0_28` selectable.

---

## 16. Cheat-Sheet: Commonly Hand-Rolled Things ratatui Already Provides

| You might write by hand… | Use this instead |
|---|---|
| `enable_raw_mode()` + `EnterAlternateScreen` + panic hook + restore | `ratatui::init()` / `ratatui::run(|t| ...)` / `ratatui::restore()` |
| `Terminal<CrosstermBackend<Stdout>>` typedef | `ratatui::DefaultTerminal` |
| `Style::new().fg(Color::Red).add_modifier(Modifier::BOLD)` | `"text".red().bold()` (`Stylize`) |
| `Style::new().bg(Color::Blue)` on a widget | `widget.on_blue()` (`Stylize`) |
| `Block::new().borders(Borders::ALL)` | `Block::bordered()` |
| manual `layout.split(area)` then `splits[0]`, `splits[1]` | `let [a, b] = Layout::vertical([...]).areas(area);` |
| computing centered popup x/y/w/h by hand | `Layout::…flex(Flex::Center)` or `Rect::centered(h, v)` / `centered_horizontally` / `centered_vertically` |
| `Min(0)` to make a region grow | `Constraint::Fill(1)` |
| building `Constraint` vecs in a loop | `Constraint::from_lengths/from_fills/from_percentages/...` |
| `Line { spans: vec![Span::raw(s)], ..}` literals | `Line::from(s)` / `Line::from(vec![..])` / `line!` macro |
| `Span { content, style }` literals | `Span::raw` / `Span::styled` / `"s".into()` / `span!` |
| splitting `"a\nb"` into lines yourself for `Text` | `Text::from("a\nb")` (auto-splits) |
| centering/aligning a title | `Line::from("t").centered()` + `Block::title_top(...)` |
| reserving space inside a block for content | `block.inner(area)` (handles borders + padding) |
| wiping cells behind a modal | `frame.render_widget(Clear, area)` |
| reimplementing `WidgetRef` to avoid moving a widget | `impl Widget for &MyWidget` |
| iterating cells of a `Rect` | `rect.positions()` / `rect.rows()` / `rect.columns()` |
| your own scroll-position math for a list | `ListState::select_next/previous` + `scroll_padding` |
| password masking | `Masked::new(secret, '*')` |
| your own event loop input types | `ratatui::crossterm::event::{read, poll, Event, KeyCode}` |
| comparing rendered output in tests | `TestBackend` + `assert_buffer_lines([...])` |
| repeated-symbol background fill | `Fill::new("░")` |
| a progress bar | `Gauge` (block) or `LineGauge` (single line) |

---

*Generated from ratatui source `ratatui-v0.30.1`. Signatures are real (extracted from source);
private/`pub(crate)` items omitted. Items gated by non-default features are noted inline.*
