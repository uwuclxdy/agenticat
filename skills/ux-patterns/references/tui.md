# Terminal Translation

How the state and feedback rules land in a terminal UI. The source material behind `SKILL.md` is
web and mobile; this file is a translation, so treat it as reasoning applied to a new target
rather than as distilled source.

## What Carries Over Unchanged

- The four states. A pane has a loading, populated, error, and empty state exactly as a screen does.
- Per-component failure isolation. One pane failing leaves the other panes usable.
- Error anatomy: what happened, why, what to do next.
- Hick's Law and progressive disclosure. Both get sharper in a terminal, where screen space is the
  binding constraint.

## What Changes

### Layout Stability Replaces the Skeleton

A terminal redraws the whole frame. Content appearing at a different height moves everything below
it, which reads as flicker.

**Do:**
- Reserve the final height while loading. A dimmed placeholder row per expected item keeps the
  frame stable when real data replaces it.
- Keep the loading representation the same shape as the loaded one.

**Don't:**
- Render a one-line "Loading..." where twenty rows will appear. Every redraw after that jumps.

### The Status Line Is the Toast

There is no floating layer. A message either takes a reserved line, replaces a pane, or takes over
the screen.

| Web | Terminal |
|---|---|
| Toast | A message on the reserved status line, cleared on the next action |
| Inline field error | A line directly under the field, inside the same pane |
| Modal | A centered popup that captures key input until dismissed |

**Do:**
- Reserve the status line permanently, so a message appearing never reflows the layout.
- Name the key that dismisses a popup, in the popup.

**Don't:**
- Draw a popup with no visible way out. In a terminal there is no click-outside and no close
  button unless you drew one.

### Empty States Name the Keybinding

The action that fills an empty pane is a key, not a button, and an unlabeled key is invisible.

**Do:**
- Write the reason and the key together: `No sessions yet. Press n to start one.`

**Don't:**
- Leave a pane blank, or print a bare `(empty)`.

### Spinners

The under-1s rule matters more here. A spinner that appears and vanishes within one or two frames
is visual noise in a redraw loop.

**Do:**
- Apply the same delay before showing, then hold a minimum.
- Prefer a determinate gauge whenever the work is countable, which in a terminal it usually is
  (files processed, bytes read).

### Choice and Disclosure

**Do:**
- Replace a long menu with a fuzzy filter over the same items. Typing to narrow is the terminal's
  native form of progressive disclosure.
- Show the three or four keys that matter on the status line, and put the rest behind a help
  overlay.

**Don't:**
- Render every binding across the bottom of the screen. That is the 200-item menu in a different
  costume.

## Color and State

Terminal themes vary wildly and some users run without color. Contrast ratios cannot be guaranteed
against an unknown background.

**Do:**
- Encode state in something other than color as well: a glyph, a label, a position. Color as the
  only signal fails for a colorblind user and for anyone on a theme you did not anticipate.
- Use the terminal's own palette indices rather than hardcoded RGB where the theme should win.

**Don't:**
- Rely on red-versus-green alone to separate failure from success.
