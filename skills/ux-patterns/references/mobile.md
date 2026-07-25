# Mobile Deltas

What changes when the target is a phone. Everything in `SKILL.md` still holds; this file lists
only where the web-first answer is wrong on a small touch screen.

Apple and Material disagree more than most write-ups admit. Where they do, both positions are
given rather than a middle one neither prescribes. Every figure here is quoted from Apple's Human
Interface Guidelines or from Material 3. Where a rule has no vendor behind it, it says so.

## Touch Targets

Three vendors, three numbers, three units. pt, dp, and CSS px are not interchangeable, so take the
one your platform uses rather than averaging them.

| Source | Figure | Unit | How it is framed |
|---|---|---|---|
| Apple, iOS / iPadOS / watchOS | 44 x 44 | pt | The recommended **default**, not the floor |
| Apple, same platforms | 28 x 28 | pt | The floor. Anything smaller is outside the guidance |
| Material 3 components, Android | 48 x 48 | dp | Stated as the minimum |
| Material 3 web density, Flutter | 48 x 48 | CSS px / logical px | Same number, different unit |
| WCAG 2.5.8 (AA) | 24 x 24 | CSS px | A conformance floor for any pointer input |

Apple, HIG Buttons: "a button needs a hit region of at least 44x44 pt ... to ensure that people
can select it easily, whether they use a fingertip, a pointer, their eyes, or a remote."

**Do:**
- Expand the hit area beyond the visible glyph when the glyph itself is small.
- Space adjacent targets so a near-miss lands on nothing rather than on the neighbor.

**Don't:**
- Trade target size for density. Material warns against it by name: shipping a denser default
  "lowers their targets below the recommended 48x48 CSS pixels". Offer density as a setting, and
  keep the controls that change it at full size.
- Treat WCAG's 24 CSS px as the mobile target. It is a conformance floor for pointer input
  anywhere, and it is roughly half of what either vendor asks for on a phone.

## Reach Shapes Navigation, Not the Primary Action

The thumb rests at the bottom of the screen, and the top corners are the hardest region to reach
on a large phone. That governs **navigation placement**. It does not govern where the primary
action goes, and assuming it does contradicts both vendors.

**Do:**
- Put primary navigation in a bottom bar on iPhone and on Android.
- Follow the platform for the primary action: Apple puts it in the **top** toolbar at the trailing
  edge, and says the tab bar is for navigation rather than actions. Material's primary action is
  the floating action button, which sits **above** the bottom navigation bar rather than inside it.
- Keep destructive controls out of the easy-reach zone, so a stray thumb cannot fire them. No
  vendor states this one; it follows from the reach argument.

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
| Block until answered | Alert | Basic dialog, centered; full-screen dialog for a task needing several fields |
| Non-blocking message | No standard component | Snackbar |
| A list of choices tied to an action | Action sheet | Modal bottom sheet |

**Do:**
- Use a centered or full-screen dialog to block on Android. Material's modal bottom sheet is for
  menus and choice lists: "Use a modal bottom sheet as an alternative to inline menus or simple
  dialogs on mobile, especially when a long list of action items appears."
- Check an iOS sheet's modality rather than assuming it. Apple: "In macOS, tvOS, visionOS, and
  watchOS, a sheet is always modal... In iOS and iPadOS, a sheet can be either modal or nonmodal."
  A nonmodal sheet lets someone affect the parent view without dismissing it.
- Show one snackbar at a time, carrying no icon. Material states both. A message that needs an
  icon needs a different component.

**Don't:**
- Replace a centered modal with a bottom sheet because it is easier to reach. Material ships a
  standard bottom sheet that does not block and a modal one that does, under the same name, so the
  swap silently changes whether the user has to answer.
- Assume Apple has a toast. The closest HIG advice is to put the information in context instead:
  for an unavailable server connection, "Mail displays an indicator that people can choose to
  learn more".

**Conflict worth knowing:** Material specifies snackbar auto-dismiss in the 4 to 10 second range.
The ARIA Authoring Practices Guide says to avoid alerts that disappear on a timer at all, citing
WCAG 2.2.3. Both are real positions. Resolve it by never putting information the user needs into
an auto-dismissing component, whatever Android permits.

## Loading Bands Are Tighter Than the Web Ones

Material publishes its own thresholds, and they do not match `SKILL.md`'s: no indicator under
200ms, a loading indicator from 200ms to 5s, a progress indicator past 5s. Material splits the
vocabulary too, calling the short-wait affordance a *loading* indicator and the long-wait one a
*progress* indicator. Take Material's numbers on Android and the measured 1s / 10s attention
limits everywhere else; the gap between them is real, not a rounding difference.

Apple publishes no phone thresholds. Its rule is to put something on screen immediately: "If you
make people wait for loading to complete before displaying anything, they can interpret the lack
of content as a problem with your app or game." That is as close as Apple comes to endorsing a
skeleton. It never uses the term, describing "placeholder text, graphics, or animations" instead.

## Right-to-Left

In Arabic, Hebrew, Farsi, and Urdu locales the layout mirrors.

**Do:**
- Use logical CSS properties (`margin-inline-start`, `inset-inline-end`) rather than `left` and
  `right`, so mirroring follows document direction with no second stylesheet.
- Mirror directional icons such as back arrows and progress chevrons. Apple, on the back button:
  "in the RTL context, a back button must point to the right so the flow of screens matches the
  reading order of the RTL language."

**Don't:**
- Mirror a logo, a checkmark, or another universal mark. They never flip.
- Mirror media transport controls. Material: "Media controls for video or audio players are always
  LTR."
- Mirror an icon depicting a real object with a fixed orientation. Both vendors reach for the
  clock as the example, Apple because it is a real-world object and Material because it turns
  clockwise.
- Hardcode a side. `right: 0` on a cart badge is a bug in half the world.

**Numerals have two rules, and the split is what people miss.** The digits inside a specific
number never reverse: Apple says "the digits in a specific number ... always appear in the same
order", naming a phone number and a credit card number. Numerals that show progress or a counting
direction do reverse, and Apple names progress bars, sliders, and rating controls. Material adds
the Hebrew exception: "Linear progress indicators should move from right to left for most RTL
languages, except Hebrew where it should remain LTR."

## Input

**Do:**
- Set the input type so the right keyboard opens (`type="email"`, `inputmode="numeric"`).
- Wire autofill hints (`autocomplete="one-time-code"`, `"tel"`, `"postal-code"`). This is Tesler's
  Law at its cheapest: a few attributes move real work off the user.
- Keep the focused field and its error message clear of the keyboard, which takes a large share of
  a phone screen the moment it opens.
- Validate credential fields as the user types. Apple prescribes it for username and password,
  Material for password. Both single out credentials by name.

**Don't:**
- Rely on a hover state to explain a control. There is no hover.
- Carry the web canon's "never validate before the user has finished" rule onto a phone unchecked.
  Neither vendor endorses it as a universal. Apple's general form guidance leans the other way
  entirely: "When you verify values as soon as people enter them ... you give them the opportunity
  to correct errors right away." Its field-level page is the precise version, and it is
  per-field-type: validate an email on blur, credentials before blur. Choose by field, not by
  platform.

## Motion

Both platforms expose a system-level reduced-motion setting, and honoring it is the mobile form of
the `prefers-reduced-motion` rule in `references/accessibility.md`. Apple's own list of what to do
when Reduce Motion is on: tighten animation springs, track animations directly with the user's
gesture, avoid animating depth changes in z-axis layers, replace axis transitions with fades, and
avoid animating into and out of blurs.
