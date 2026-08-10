# Accessibility of States

Authored from W3C primary sources (WCAG 2.2 Recommendation, its Understanding docs, the ARIA Authoring Practices Guide), not from the material behind the rest of this skill. Every criterion below was checked against w3.org rather than recalled.

A criterion here is a published conformance requirement. A repo convention does not override one.

## Wiring Per Pattern

| Pattern | What it needs | Criterion |
|---|---|---|
| Spinner or loading indicator | An accessible name and a live region, so the state reaches someone not watching the animation. A purely visual spinner is a clean failure | 4.1.3 (AA) |
| Skeleton placeholder | Marked so assistive tech does not read placeholder shapes as real content. `aria-busy="true"` on the region under load lets AT batch the swap | 4.1.2 (A), 4.1.3 (AA) |
| Progress bar | The live region carries the progress value, not only the visual fill | 4.1.3 (AA) |
| Toast | `role="status"` for neutral messages, `role="alert"` for errors. `status` implies `aria-live="polite"`; `alert` is assertive and interrupts | 4.1.3 (AA) |
| Inline field error | The error text is programmatically tied to its field, and it describes the problem in words | 3.3.1 (A), 4.1.2 (A) |
| Correction hint | When the fix is knowable, offer it | 3.3.3 (AA) |
| Modal | `role="dialog"` plus `aria-modal="true"`, focus moves inside on open, Tab cycles within, Escape closes, focus returns to the invoking element, background inert | ARIA APG Dialog (Modal) |
| Empty state | Carries text, not only an illustration | 1.1.1 (A) |
| Success message | Announced without stealing focus | 4.1.3 (AA) |
| Form | Every input labeled or carrying instructions; required and invalid states exposed programmatically, not by color or an asterisk alone | 3.3.2 (A), 4.1.2 (A) |
| A multi-step process | Anything the user already entered in the same process is auto-populated or available to select. Browser autofill does not discharge this: "it is the content (the website) that needs to provide the stored information" | 3.3.7 (A) |
| Password or verification-code field | Paste works, and a password manager or the user agent can fill it. Manual transcription of a one-time code is a failure | 3.3.8 (AA) |
| Session expiry, or any time limit the content sets | One of turn off, adjust, or extend. Only the Extend option carries a warning-before-expiry requirement | 2.2.1 (A) |
| Payment, booking, deletion | Reversible, checked, or confirmed before it finalizes | 3.3.4 (AA) |
| Celebration animation | Nothing flashes more than three times per second | 2.3.1 (A) |
| Any auto-starting motion | Pausable, stoppable, or hideable when it runs over five seconds beside other content | 2.2.2 (A) |

## The One That Surprises People

A modal is **exempt** from the status-message criterion, and a toast is not. WCAG's own worked example:

> An author displays an error message in a dialog. Since the dialog takes focus, it is defined as > a change of context and does not meet the definition of a status message. As a result of taking > focus, the new change of context is already announced by the screen reader, and thus does not > need to be included in the scope of this success criterion.

So "toast or modal" is not a free choice at the accessibility layer. A modal announces itself by taking focus, which is the same reason it interrupts whatever the user was doing. A toast announces nothing on its own and needs the right role to exist for a screen reader at all.

## Criteria Reference

| SC | Title | Level | New in 2.2 |
|---|---|---|---|
| 1.4.3 | Contrast (Minimum): 4.5:1 for text, 3:1 for large-scale text | AA | no |
| 1.4.11 | Non-text Contrast: 3:1 for UI components and meaningful graphics | AA | no |
| 2.2.1 | Timing Adjustable | A | no |
| 2.2.2 | Pause, Stop, Hide | A | no |
| 2.3.1 | Three Flashes or Below Threshold | A | no |
| 2.3.3 | Animation from Interactions | AAA | no |
| 2.4.7 | Focus Visible | AA | no |
| 2.4.11 | Focus Not Obscured (Minimum) | AA | **yes** |
| 2.4.13 | Focus Appearance | AAA | **yes** |
| 2.5.8 | Target Size (Minimum): 24 by 24 CSS px | AA | **yes** |
| 2.5.5 | Target Size (Enhanced): 44 by 44 CSS px | AAA | no |
| 3.3.1 | Error Identification | A | no |
| 3.3.2 | Labels or Instructions | A | no |
| 3.3.3 | Error Suggestion | AA | no |
| 3.3.4 | Error Prevention (Legal, Financial, Data) | AA | no |
| 3.3.7 | Redundant Entry | A | **yes** |
| 3.3.8 | Accessible Authentication (Minimum) | AA | **yes** |
| 4.1.2 | Name, Role, Value | A | no |
| 4.1.3 | Status Messages | AA | no |

Targets: 2.5.8 allows undersized targets when spacing keeps 24px circles centered on each from intersecting, when the size comes from the user agent default untouched, or when the size is essential to the information. Treat 24px as the floor and 44px as the comfortable size.

3.3.7 is scoped to one process, so it does not ask you to store anything between sessions: "A process is defined on the basis of an activity and is not applicable when a user returns after closing a session or navigating away." A process can still cross domains, so a checkout that hands off to a third-party payment provider stays inside it.

Large-scale text is defined by point size only: 18 point, or 14 point bold. The pixel equivalents in wide circulation (roughly 24px and 18.66px) are a conversion, not something the spec states.

`prefers-reduced-motion` is a sufficient technique under 2.3.3, named in the Understanding document rather than in the criterion itself. Honoring it is the practical way to satisfy 2.3.3, though the criterion asks for any mechanism to disable interaction-triggered motion.

## Where the Spec Runs Out

**An auto-dismissing toast: the criteria are silent, the ARIA guidance is not.** WCAG 2.2 itself never addresses a message that disappears on a timer. The Timing Adjustable Understanding document mentions no notification, toast, or timed message anywhere. A literal reading of "for each time limit that is set by the content" does not exclude a toast, and none of its exceptions name one.

The Authoring Practices Guide answers it directly, though, and points at the criterion:

> It is also important to avoid designing alerts that disappear automatically. An alert that > disappears too quickly can lead to failure to meet WCAG 2.0 success criterion 2.2.3.

Treat that as the working answer: do not auto-dismiss anything carrying information the user needs. The safe build:

- Give the toast a role, so its content reaches AT regardless of how long it stays up.
- Keep anything a user must act on out of a timed dismissal entirely. Put it inline or in a dialog.
- Leave a persistent record of dismissed messages where the information still matters.

**Optimistic UI needs a real failure path.** Announcing success before the server confirms is not addressed by name anywhere in the spec, and 3.3.4 is the wrong criterion to reach for: its options all govern review and correction *before* a submission finalizes, not when a success message may render. Its Reversible option points the other way: optimistic rendering backed by a real undo satisfies it.

What does bite: when the action later fails, that failure has to be identified and described in text (3.3.1). A silent rollback fails it. The rest of the objection is a usability one, not a conformance one: a status message that was never true is worse than a slower true one.

## Not Verified

Confirm these against the live spec before relying on them:

- Whether the APG Dialog pattern mandates an accessible name through `aria-labelledby` or `aria-label`. It is standard practice; it was not retrievable verbatim from the page.
- The full exception list for 2.5.8, beyond Spacing, User agent control, and Essential.
- The exact text of 1.1.1 Non-Text Content, cited above through a cross-reference rather than from its own page.
- Whether an auto-dismissing toast fails 2.2.2's auto-updating clause. That clause carries no five-second floor, unlike its moving-and-blinking sibling, and whether a one-shot toast counts as auto-updating information is unresolved in the source.
