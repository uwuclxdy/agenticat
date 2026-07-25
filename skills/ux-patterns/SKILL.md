---
name: ux-patterns
description: "Interaction-design knowledge pack for the behavior of a UI: loading, error, empty, and success states, form validation, error placement, progressive disclosure, and the accessibility rules governing each. Use when building or reviewing a screen's states, wiring form validation, choosing a spinner or skeleton, wording an error message, placing navigation, or auditing an interface for usability."
metadata:
  author: uwuclxdy
  version: "1.1"
---

# UX Patterns

How an interface should behave, for whoever is writing it. Scoped to interaction: states,
feedback, forms, and the cognitive-load laws behind layout decisions.

| File | Read it for |
|---|---|
| This file | Web-first behavior rules |
| `references/accessibility.md` | The conformance wiring every state needs. Read it alongside any state you build |
| `references/mobile.md` | What changes on a phone |

For a CLI or a terminal UI, load the **terminal-ux** skill if it is installed. Exit codes, stream
discipline, TTY detection, and terminal screen-reader behavior have their own canon and are not
covered here.

Not covered here: type scales, color palettes, visual style, brand. A rule that needs a specific
palette or type scale is out of scope, so say so rather than inventing values. Contrast appears in
the accessibility reference as a conformance floor, never as a palette.

Treat these as directional. A repo's established pattern wins over a rule here; match the
surrounding code. Two markers override that:

- **WCAG x.x.x (Level)** means a published conformance criterion. Not a preference, and not
  something a repo convention overrides.
- A named law is an aphorism with a citation, not a finding. Jakob's Law was coined by Nielsen as a
  summary of his own heuristics. Tesler's traces to an interview and has a published counter-
  argument. Hick's is real research about something narrower than its usual application. Each
  section states what its law actually rests on; none of them settle an argument by themselves.

Everything unmarked is a strong default. Numbers are starting values unless a rule says otherwise.
Two are measured and marked as such: the 1 second and 10 second response-time limits.

---

## 1. Every Screen Has Four States

### 1.1 Build All Four

Every screen has a loading state, a success state, an error state, and an empty state. Build all
four or users will find the ones you skipped.

**Do:**
- Enumerate the four before writing the screen. The success state is the one you were already
  building; the other three are the work.
- Treat "this can't be empty" and "this can't fail" as claims to check, not assumptions. A list
  seeded with defaults is empty on the day the seed fails.

**Don't:**
- Ship the happy path and handle the rest with whatever the framework does by default. That is
  usually a blank screen, a raw stack trace, or nothing at all.

Why: the three states you skipped are the ones a user hits on their worst day, when a network is
flaky or an account is new. That is the wrong moment for undefined behavior.

### 1.2 Isolate State Per Component

Each section owns its own data, its own loading state, and its own errors. One section failing
leaves the rest of the page working.

**Do:**
- Give a failed section its own error box and its own retry control, inside its own bounds.
- Render each section as soon as its own data arrives.

**Don't:**
- Block the whole page on a global loading flag until every request resolves.
- Escalate one widget's failure into a full-page error that hides everything that did load.

Why: a dashboard where the revenue chart is down is still useful for everything else on it. A
full-page error throws away work that already succeeded.

---

## 2. Loading

### 2.1 Match the Indicator to the Wait

The indicator type follows from what is loading and whether the duration is knowable.

| Situation | Indicator |
|---|---|
| A page or a large content region | Skeleton matching the real layout |
| Known, measurable progress (upload, download, install) | Progress bar with the actual percentage |
| A small contained action (one button, one row refreshing) | Inline spinner scoped to that element |
| A change you can safely assume succeeds | Optimistic UI: render the result now, roll back on failure |

**Do:**
- Shape a skeleton like the content that replaces it, so the layout does not jump when data lands.
- Use optimistic UI only where a rollback is cheap and visible. A like button qualifies. A payment
  does not.

**Don't:**
- Use a spinner for a file upload. Progress is knowable there, so withholding it is a choice to
  tell the user less.
- Animate a skeleton so heavily it reads as content.

Why: a skeleton lets someone parse the layout while data is in flight, so the wait does double
duty. A progress bar answers "how much longer", which a spinner never can.

**WCAG 4.1.3 (AA):** a spinner that exists only as an animation reaches nobody using a screen
reader. Every loading indicator needs an accessible name and a live region, and a skeleton needs
marking so its placeholder shapes are not read as content.

### 2.2 Thresholds for Spinners

How long the wait is decides what to show. Rough starting values, not measured thresholds:

The 1 second and 10 second limits are measured, from Miller 1968 and Card et al. 1991 by way of
Nielsen. They are about human attention, so they have not moved with hardware.

| Wait | Show | Why |
|---|---|---|
| Under 0.1s | Nothing | Reads as instantaneous |
| Up to 1s | Nothing, or just the result | A train of thought survives this uninterrupted |
| 1 to 10s | An indicator, with text naming the operation | Attention holds, but only if the screen proves it is working |
| Past 10s | Percent done, expected completion, and a way to cancel | Attention is gone; people switch tasks and need to know when to come back |

**Do:**
- Delay the indicator briefly before showing it, then hold it a short minimum. This reconciles a
  spinner on a button with the sub-1s rule: fast responses never flash one. No source gives a
  number for that delay, so pick one and keep it consistent rather than citing it as a threshold.
- Advance the text for long waits ("Connecting", "Fetching your data") so the screen proves
  something is still happening.
- Give anything past 10 seconds an interrupt. A user who cannot cancel a long operation is stuck
  watching it.

**Don't:**
- Flash a spinner for a 200ms response. The flicker reads as a glitch and makes the app feel
  slower than showing nothing would.
- Leave a bare looping animation running past ~10s with no text and no progress.
- Run a long wait and then resolve it into an error. Validate what you can before the wait starts.

Why: a spinner communicates "working" and nothing else. Past a few seconds that stops being
enough, and the user has no way to tell working from hung.

---

## 3. Errors

### 3.1 Say What Happened, Why, and What Now

An error message has three jobs: name what failed, give the reason in the user's terms, and offer
the next action.

**Do:**
- Write all three parts. "Your payment didn't go through. Your card was declined. Check your card
  details or try a different payment method."
- Keep the technical detail where engineers can reach it (logs, a correlation ID shown to the
  user) and out of the message itself.

**Don't:**
- Render backend text at the user. A raw exception is unreadable to most people and leaks
  internals worth keeping private.
- Ship "Something went wrong". It names nothing and suggests nothing.
- Fail silently. A submit button that does nothing on click is the worst version, because the
  user cannot tell a broken app from a slow one.

**WCAG 3.3.1 (A) and 3.3.3 (AA):** the failing item has to be identified and the problem described
in text, and where the fix is knowable you have to offer it. Both are what the three-part message
above already does; the conformance part is that the text exists and is tied to the right control.

### 3.2 Put the Error Where the Problem Is

Placement follows severity and location. The closer the message sits to the thing that failed,
the less hunting it costs.

| Placement | Use for | Behavior |
|---|---|---|
| Inline | A specific field or control that failed | Sits next to it, persists until fixed |
| Toast | Non-blocking, informational, recoverable | Appears at a screen edge, stays until dismissed |
| Modal | The user genuinely cannot continue | Blocks interaction, carries the action button |

**Do:**
- Default to inline. Most errors belong to one field or one control.
- Give a modal an action, never just an acknowledgement. A modal that only says "Access denied"
  with an OK button has stolen attention and given nothing back.

**Don't:**
- Show an important error as a toast. Anyone looking elsewhere misses it entirely.
- Reach for a modal because the error feels serious. Serious is not the test; blocked is.

**WCAG 4.1.3 (AA):** toast and modal are not interchangeable here either. A modal is exempt from
the status-message criterion precisely because taking focus already announces it. A toast is
inside the criterion and reaches a screen reader only if it carries `role="status"` or
`role="alert"`. A modal has its own obligations instead: focus in on open, focus back on close,
Escape to dismiss. See `references/accessibility.md`.

**Do not auto-dismiss on a timer.** The ARIA Authoring Practices Guide is direct about it: "It is
also important to avoid designing alerts that disappear automatically. An alert that disappears
too quickly can lead to failure to meet WCAG 2.0 success criterion 2.2.3." A timer that suits a
fast reader cuts off a slow one, someone using magnification, or anyone who looked away.

---

## 4. Empty States

An empty screen explains why it is empty and offers the action that fills it.

**Do:**
- Name the reason ("No projects yet"), then give the control that resolves it ("Create project").
- Treat a first-run empty state as onboarding. It is the one screen every new user sees.
- Offer a recovery path for empty search results: a correction, a broader query, a way back.
- Let a deliberately-cleared list read as an achievement rather than a void.

**Don't:**
- Render nothing at all. A blank region is indistinguishable from a failed one.
- Ship bare text with no action. "No results found" tells the user what they already knew.

Why: empty is the state where the user has the least to go on and the most need for direction.

**WCAG 1.1.1 (A):** an empty state carried by an illustration alone says nothing to a screen
reader. The message goes in text.

---

## 5. Success Feedback

Scale the response to the size of what the user did.

| Action | Response |
|---|---|
| Small (like, toggle, reorder) | The control's own state changes. Nothing more |
| Consequential (payment, booking, publish) | A dedicated success state naming what happened |
| Milestone (finished onboarding, cleared a queue) | A celebration, used sparingly |

**Do:**
- Confirm anything irreversible or anything involving money in a way the user cannot miss.
- State what actually happened, not that a request succeeded. "You're booked on the 4:15" beats
  "Success".

**Don't:**
- Let a consequential action resolve into a reset button and no other change. The user is left
  guessing whether they were charged.
- Fire a full-screen celebration for a routine save. Overused, it becomes something to dismiss.

Why: uncertainty after an irreversible action is the most expensive feeling an interface can
produce. It sends people to support, or to doing it twice.

**WCAG 4.1.3 (AA):** a success message that appears without taking focus needs `role="status"` to
reach a screen reader.

On optimistic UI, the objection is usability rather than conformance: a success message that was
never true is worse than a slower true one. If it later fails, the failure has to be identified
and described in text (3.3.1); a silent rollback fails that. Backing optimistic rendering with a
real undo is the version that holds up.

---

## 6. Forms

### 6.1 Validate Where the Work Is

Catch problems at the field, while the user is still there.

**Do:**
- Show constraints up front. Password rules render as a live checklist, not as a rejection after
  submit.
- Show a character count against its limit while typing.
- Mark the *optional* fields. GOV.UK's position is never to asterisk required ones, since the
  asterisk is unexplained and the required case is the default a user assumes anyway.
- Pre-fill anything you already know about a signed-in user.
- On a failed submit: render an error summary at the top, move keyboard focus to it, prefix the
  page title with "Error:", and link each entry to its field. Keep every answer the user already
  gave, passing and failing both.

**Don't:**
- Disable the submit button. This is the rule most often gotten wrong. A disabled button is not
  focusable, so someone tabbing through cannot reach it to find out why it is dead; it has poor
  contrast; and a user who fixes the last field may never notice it came alive. GOV.UK: "Disabled
  buttons have poor contrast and can confuse some users, so avoid them if possible." Let the
  submit happen and answer with an error summary. If you must disable, `aria-disabled="true"`
  keeps it focusable where the `disabled` attribute does not.
- Clear fields on a validation failure. Making someone retype a correct answer because a different
  one was wrong is the fastest way to lose them.
- Let someone exceed a limit freely and discover it only at submit.

**When to validate is genuinely contested.** GOV.UK says wait for submit: "Do not validate when
the user moves away from a field. Wait until they try to move to the next part of the service."
Baymard's testing supports on-blur: "the validity of each field input should be checked when the
user leaves the field." Both camps agree on the negative, so treat that as the rule: never
validate a field the user has not finished with.

Two on-blur bugs to handle if you go that way: a password manager filling a field fires blur and
shows an error prematurely, and a value split across several inputs (a date, a card number) has no
single meaningful blur.

**WCAG 3.3.2 (A) and 4.1.2 (A):** every input carries a label or instructions, and required and
invalid states are exposed programmatically. A red border and an asterisk are visual conventions
that carry no meaning to assistive tech on their own.

### 6.2 Accept What People Type

Normalize input instead of rejecting it.

**Do:**
- Accept a phone number with spaces, dashes, parentheses, or none, then normalize server-side.
- Trim whitespace, accept both letter cases, tolerate a pasted value carrying formatting.

**Don't:**
- Reject a semantically valid value over its punctuation. The user has given you the right answer
  and you have said no.

Why: format rejection is the cheapest failure to eliminate. The parsing is a few lines and it
removes an entire class of user error.

---

## 7. Cognitive Load

### 7.1 Jakob's Law: Meet the Existing Expectation

Users spend most of their time on other products, so they expect yours to work like those.

**Do:**
- Put conventional elements where convention puts them. On desktop web, the cart goes top right,
  navigation across the top, account controls in a corner.
- Spend novelty budget on what makes the product different, not on relocating its cart.

**Don't:**
- Move a standard control to be distinctive. The cost lands on every user, every session.

Attribution: Jakob Nielsen, Nielsen Norman Group. Which placement counts as conventional differs
between desktop and phone, and between left-to-right and right-to-left locales; see
`references/mobile.md`.

### 7.2 Hick's Law: Fewer Visible Choices

Decision time grows with the number and complexity of options.

**Do:**
- Cut a long option list to the ones that matter, and let search or filters reach the rest.
- Split a long form across steps. The conversion numbers quoted around this rule trace to
  marketing case studies rather than research, so take the direction and ignore the percentages.
- Curate rather than enumerate. A short recommended set beats the full catalog.

**Don't:**
- Render a 200-item menu and call it complete.
- Put every category into one dropdown because the data model has them.

Attribution, and it does not hold up: Hick and Hyman timed decisions in response to clear visual
stimuli, with a known option set. Applying the law to menu and navigation search is a documented
misuse, because the user is searching rather than choosing. The advice survives on other evidence:
novice search time is linear in menu length, and some menu layouts never reach Hick-Hyman
performance at all because they cannot be learned. Cut the list because searching it is slow, not
because a law says so.

### 7.3 Progressive Disclosure: Show What Is Needed Now

Surface what the current step requires. Keep the rest one interaction away.

**Do:**
- Reveal advanced options on request rather than by default.
- Let typing filter a large option set, so the full list never needs rendering at once. A
  slash-command menu is this pattern.
- Ask of every element on a screen whether it is needed at this moment.

**Don't:**
- Bury the primary action behind the disclosure. Hiding complexity is the goal; hiding the main
  path is a different mistake with the same mechanism.
- Replace a long list with a long list behind a click.

### 7.4 Tesler's Law: Absorb the Complexity

Inherent complexity cannot be removed, only moved. Decide who carries it.

**Do:**
- Take the burden into the system. Detect the intro's timestamps and offer one skip control.
  Remember the card. Infer the timezone.
- Weigh it honestly: an engineer's week against a minute of every user's time, repeated.

**Don't:**
- Export a modeling problem to the user as a form field. A required field that exists because the
  backend needs disambiguation is complexity you declined to absorb.

Attribution: Larry Tesler, 1980s. His framing: if a million users each waste a minute on
complexity an engineer could have solved in a week, you have penalized the user to make the
engineer's job easier.

---

## Quick Reference

| Area | Do | Don't |
|---|---|---|
| **States** | Build loading, success, error, empty for every screen | Ship the happy path and let the framework decide the rest |
| **Failure scope** | Each section owns its data, loading, and errors | One widget's failure taking down the whole page |
| **Loading type** | Skeleton for regions, progress bar for knowable waits, inline spinner for one control | A spinner on a file upload |
| **Loading timing** | Nothing under 1s; text with the indicator from 1 to 10s; percent done, ETA and a cancel past 10s | Flashing a spinner on a 200ms response; a bare loop past 10s with no way out |
| **Error content** | What happened, why, what to do next | Raw backend text, "Something went wrong", silent failure |
| **Error placement** | Inline by default; modal only when actually blocked | Important errors as toasts; modals for emphasis |
| **Empty** | Name the reason, offer the action that fills it | A blank region, or bare "No results found" |
| **Success** | Scale to the action; confirm anything irreversible | Nothing at all after a payment; confetti for a save |
| **Forms** | Show constraints live, mark optional fields, answer a failed submit with a focused error summary | Disabling submit; clearing fields on failure; asterisking required fields |
| **Input** | Normalize formatting server-side | Rejecting a valid value over its punctuation |
| **Convention** | Standard controls in their standard places | Novelty spent on relocating basics |
| **Choice** | Cut, filter, curate, split long forms | 200-item menus, every category in one dropdown |
| **Disclosure** | Advanced options on request, typing to filter | The primary action hidden behind a reveal |
| **Complexity** | Absorb it into the system | A form field that exists for the backend's benefit |
| **Announcing** | `role="status"` or `role="alert"` on anything that appears without taking focus | A spinner, toast, or success message that exists only as pixels |
| **Modals** | Focus in on open, back on close, Escape to dismiss | A dialog you can tab out of behind the overlay |
