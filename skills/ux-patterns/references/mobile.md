# Mobile Deltas

What changes when the target is a phone. Everything in `SKILL.md` still holds; this file lists
only where the web-first answer is wrong on a small touch screen.

## Reach Decides Placement

The thumb rests at the bottom of the screen. The top corners are the hardest region to reach on a
large phone, and the top right is the hardest of all for a right-handed grip.

**Do:**
- Put primary navigation and the primary action in a bottom bar.
- Keep destructive controls out of the easy-reach zone, so a stray thumb cannot fire them.

**Don't:**
- Port a desktop layout as-is. The desktop cart lives top right; the phone cart belongs in the
  bottom bar. Both are Jakob's Law, applied to different conventions.

## Mirror for Right-to-Left Locales

In Arabic, Hebrew, Farsi, and Urdu locales the whole layout mirrors. What sits top right in a
left-to-right locale sits top left there.

**Do:**
- Use logical CSS properties (`margin-inline-start`, `inset-inline-end`) rather than `left` and
  `right`, so mirroring follows the document direction with no second stylesheet.
- Mirror directional icons (back arrows, progress chevrons). Do not mirror icons that depict a
  real object with a fixed orientation, like a clock.

**Don't:**
- Hardcode a side. `right: 0` on a cart badge is a bug in half the world.

## Touch Targets

A control needs to be big enough to hit without precision. See `references/accessibility.md` for
the conformance minimums and their exceptions; those are floors, not targets. Comfortable is
larger than conforming.

**Do:**
- Expand the hit area beyond the visible glyph when the glyph itself is small.
- Space adjacent targets so a near-miss lands on nothing rather than on the neighbor.

## State Patterns That Shift

| Pattern | Web answer | Phone answer |
|---|---|---|
| Blocking dialog | Centered modal | Bottom sheet, reachable by thumb |
| Non-blocking message | Toast at a screen edge | Snackbar above the bottom bar, clear of the system gesture area |
| Long form | One page, sectioned | Steps, one decision per screen |
| Hover-revealed detail | Tooltip on hover | There is no hover. Make it visible, or move it behind a tap |

## Input

**Do:**
- Set the input type so the right keyboard opens (`type="email"`, `inputmode="numeric"`).
- Wire autofill hints (`autocomplete="one-time-code"`, `"tel"`, `"postal-code"`). This is Tesler's
  Law at its cheapest: a few attributes move real work off the user.
- Assume the keyboard covers the bottom third of the screen when it opens, and keep the focused
  field and its error message visible.

**Don't:**
- Rely on a hover state to explain a control.
- Trigger validation on every keystroke on a phone. The user is typing on glass and will trip
  every rule on the way to a correct value; validate when the field loses focus.
