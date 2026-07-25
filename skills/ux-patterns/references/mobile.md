# Mobile Deltas

What changes when the target is a phone. Everything in `SKILL.md` still holds; this file lists
only where the web-first answer is wrong on a small touch screen.

Apple and Material disagree more than most write-ups admit. Where they do, both positions are
given rather than a middle one neither prescribes. Detail and quotes: `docs/research/mobile-brief.md`.

## Reach Shapes Navigation, Not the Primary Action

The thumb rests at the bottom of the screen, and the top corners are the hardest region to reach
on a large phone. That governs **navigation placement**. It does not govern where the primary
action goes, and assuming it does contradicts both vendors.

**Do:**
- Put primary navigation in a bottom bar on iPhone and on Android.
- Follow the platform for the primary action: Apple puts it in the **top** toolbar at the trailing
  edge, and says the tab bar is for navigation rather than actions. Material's primary action is
  the floating action button, which sits **above** the bottom navigation bar rather than inside it.
- Keep destructive controls out of the easy-reach zone, so a stray thumb cannot fire them.

**Don't:**
- Put the primary action in the bottom navigation bar. Neither vendor does this.
- Assume the bottom bar rule generalizes across a vendor's own devices. iPadOS puts the tab bar at
  the **top**.
- Port a desktop layout as-is. Both are Jakob's Law applied to different conventions.

## Blocking and Transient Messages

The web-to-mobile component mapping is not one to one, and the vocabulary is not shared. Apple's
guidelines have no "toast" and no "snackbar" concept at all.

| Need | Apple | Material |
|---|---|---|
| Block until answered | Alert | Basic dialog, centered; full-screen dialog for a bigger task |
| Non-blocking message | No direct equivalent | Snackbar |
| A list of choices | Sheet, with detents and a grabber | Modal bottom sheet |

**Do:**
- Use a centered or full-screen dialog to block on Android. The modal bottom sheet is for menus
  and choice lists, not for blocking confirmation.
- Give an Apple sheet its detents, grabber, and swipe-to-dismiss behavior. An iOS sheet is not
  inherently modal.

**Don't:**
- Replace a centered modal with a bottom sheet because it is easier to reach. That swaps a
  blocking component for a non-blocking one.

**Conflict worth knowing:** Material specifies snackbar auto-dismiss in the 4 to 10 second range.
The ARIA Authoring Practices Guide says to avoid alerts that disappear on a timer at all, citing
WCAG 2.2.3. Both are real positions. Resolve it by never putting information the user needs into
an auto-dismissing component, whatever Android permits.

## Touch Targets

Apple, Material, and WCAG each state a different number in a different unit, and pt, dp, and CSS
px are not interchangeable. Check `docs/research/mobile-brief.md` for the per-vendor figures
before hardcoding one. WCAG's 24 CSS px (2.5.8, AA) is a conformance floor rather than a target;
both vendors ask for more.

**Do:**
- Expand the hit area beyond the visible glyph when the glyph itself is small.
- Space adjacent targets so a near-miss lands on nothing rather than on the neighbor.

**Don't:**
- Trade target size for density. Material warns against this explicitly.

## Right-to-Left

In Arabic, Hebrew, Farsi, and Urdu locales the layout mirrors.

**Do:**
- Use logical CSS properties (`margin-inline-start`, `inset-inline-end`) rather than `left` and
  `right`, so mirroring follows document direction with no second stylesheet.
- Mirror directional icons such as back arrows and progress chevrons.

**Don't:**
- Mirror a logo. They never flip.
- Mirror media transport controls. Play, rewind, and fast-forward stay left-to-right because they
  refer to the direction of the media, not of the text.
- Mirror an icon depicting a real object with a fixed orientation, such as a clock.
- Hardcode a side. `right: 0` on a cart badge is a bug in half the world.

Numerals have their own rules that differ between running text and progress controls; see the
brief before assuming.

## Input

**Do:**
- Set the input type so the right keyboard opens (`type="email"`, `inputmode="numeric"`).
- Wire autofill hints (`autocomplete="one-time-code"`, `"tel"`, `"postal-code"`). This is Tesler's
  Law at its cheapest: a few attributes move real work off the user.
- Assume the keyboard covers the bottom third of the screen when it opens, and keep the focused
  field and its error message visible.
- Validate credential fields live as the user types. Apple prescribes this for username and
  password, Material for password. This is a deliberate exception to the general rule against
  validating a field the user has not finished.

**Don't:**
- Rely on a hover state to explain a control. There is no hover.
- Extend the credential carve-out to ordinary fields. Everywhere else, validating mid-typing
  punishes someone on the way to a correct value.
