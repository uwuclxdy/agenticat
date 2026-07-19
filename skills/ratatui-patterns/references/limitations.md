# Ratatui Built-In Limitations: What Genuinely Needs Custom Code

Verified against ratatui 0.30.2 across 6 production TUIs (2026-07 audit). Before writing ANY
custom render code, confirm the need is on this list; if it isn't, expect a built-in in the checklist or
`api-reference.md`. When a future release closes one of these
gaps, the updater skill moves the row into the checklist.

## Composite / Inline Elements

| need | closest built-in | gap | keep custom |
|---|---|---|---|
| progress bar spliced INSIDE a text row (label + value + bar sharing one `Line`) | `Gauge`/`LineGauge` | both demand their own `Rect`; cannot interleave with sibling spans | span-built glyph fill; share one glyph builder per repo (use `symbols::bar::NINE_LEVELS` for the glyphs) |
| two-tone / multi-segment bar (verified vs failed, stacked shares) | `Gauge` | single fill color only | span-built segments |
| indeterminate / marquee "bouncing block" bar | none | no indeterminate mode on any progress widget | custom tick-driven fill |
| sparkline as an inline `Span` inside a wider row | `Sparkline` | owns a `Rect` | inline glyph bucketing (same 8-level math) |
| min-max-normalized f32 sparkline (shape, not magnitude) | `Sparkline` | 0-anchored u64 magnitude only; pre-shifting data loses precision | custom normalize + glyph map |
| button / button-group row | none | no button widget exists | spans + manual focus index |
| responsive tab collapse (chevron overflow when width is tight) | `Tabs` | fixed strip, no degrade mode | custom overflow logic |

## Text

| need | closest built-in | gap | keep custom |
|---|---|---|---|
| text editing (input field, textarea: caret, scroll-clamp, selection) | none | ratatui ships no text-editing widget; only `Frame::set_cursor_position` | custom widget, or crates `tui-textarea`/`tui-input` |
| word-wrap as DATA (wrap points, `Vec<String>`, bounded-rows-with-ellipsis) | `Paragraph::wrap` | renders wrapped text but exposes no wrap positions; `line_count`/`line_width` (unstable feature) give counts only | own wrapper; dedupe it: 3 repos each had 2 copies |
| soft-wrap editor with caret-to-visual-row mapping | `Paragraph::wrap` | wrap would break caret column math | custom (caret index tracked separately from wrapped rows) |

## Animation / Time

ratatui has zero animation, timer, or blink primitives by design: it draws frames, the app owns
time. Everything below stays custom (tick-driven, timing consts named):

- spinners (frame cycling)
- attention shimmer / status pulse (per-glyph traveling-crest color sweep, tick-driven recolor
  of spans; no built-in primitive)
- cursor blink
- toast TTL / stacked notification lifetimes (rendering the toast box is plain `Paragraph` +
  `Clear`; the stack layout + expiry is app logic)

## Compositing / Effects

| need | closest built-in | gap | keep custom |
|---|---|---|---|
| alpha-blend / translucency ("glass" panes, dimmed backdrops) | `CellEffect` trait (0.30.2: effects must be `Send + Sync`) | no built-in translucency effect ships | raw `Cell` walk blending fg/bg |
| per-cell time-varying color (shimmer, glow) | none | styles are static per draw | recolor spans per tick |
| xterm-256 nearest-color quantization | `Color` | no color-distance API | own quantizer |

## Selection / Structure

| need | closest built-in | gap | keep custom |
|---|---|---|---|
| selection caret/tint across HETEROGENEOUS row widgets (mixed row types in one pane) | `List`/`Table` selection | both assume uniform ownership of rows | direct `Buffer`/`Cell` writes for gutter glyph + row tint (correct idiom, not a smell) |
| targeted repaint of part of an already-drawn region | none | widgets draw whole areas | scoped `Buffer::set_stringn` writes |
| connected topology diagrams (boxes + link lines) | `Canvas` | cell-grid connectors don't map to canvas coords cleanly | raw buffer writes for connectors; borders can still be `Block` |

## Design-System Conformance (Custom Look vs Built-Ins)

Case study: a design system with its own custom border/scrollbar/progress rendering and theme.
It CAN adopt built-ins for: panel border+title (`Block::bordered()`), scrollbar (`Scrollbar`),
modal centering (`Rect::centered`), equal splits (`Layout` + `Fill`), border seams
(`merge_borders`), drop shadows (`Block::shadow`, currently unbuilt, adoptable), progress
rendering (`LineGauge`, keeping threshold-color logic app-side).

it CANNOT conform on: gutter caret + focus-row tint over heterogeneous rows, button rows in
modals, spinner/cursor-blink (no time primitives), text input/textarea, skeleton multi-column
placeholders (`Fill` covers one column only), min-max f32 sparkline. these stay direct
buffer/cell writes; that is the correct escape hatch, not a violation. a chosen theme palette
and glyph tiers are design decisions, not API gaps.
