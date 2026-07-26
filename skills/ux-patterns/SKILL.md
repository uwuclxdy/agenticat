---
name: ux-patterns
description: "Interaction-design knowledge pack for how a UI behaves: the five screen states (loading, success, error, empty, partial), form validation and submission, error copy, undo versus confirmation, progressive disclosure, plus the accessibility wiring each needs. Use when building a screen's states, wiring validation, choosing a spinner or skeleton, wording an error, or deciding between a confirmation and an undo."
metadata:
  author: uwuclxdy
  version: "1.4"
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
- A named law here is a label, and what sits under each one differs. Jakob's was coined by Nielsen
  as a summary of his own heuristics. Tesler's traces to an interview and carries a published
  counter-argument. Hick's is real experimental work, measuring something narrower than its usual
  application. Each section states what its law actually rests on; naming one settles nothing.

Everything unmarked is a strong default. Numbers are starting values unless a rule says otherwise.
Three are measured and marked as such: the 0.1s, 1s and 10s response-time limits.

---

## 1. Every Screen Has Five States

### 1.1 Build All Five

| State | What it is |
|---|---|
| Loading | The request is in flight and nothing has settled |
| Success | The state you designed for: enough data, everything worked |
| Error | The fetch or the action failed |
| Empty | The request settled and there is genuinely nothing |
| Partial | The request settled and there is barely anything: 3 rows where 20 belong, one widget configured, a chart with two points |

Success is the one you were already building. The other four are the work.

**Do:**
- Enumerate all five before writing the screen.
- Treat "this can't be empty" and "this can't fail" as claims to check, not assumptions. A list
  seeded with defaults is empty on the day the seed fails.
- Handle partial explicitly. It is the state that looks like success and behaves like empty, so it
  ships broken: the layout was built for twenty rows, it gets three, and the screen reads as
  finished while telling the user nothing. Say what is missing and offer the step that fills it.

**Don't:**
- Ship the happy path and handle the rest with whatever the framework does by default. That is
  usually a blank screen, a raw stack trace, or nothing at all.
- Let partial ride the success path because the code path is the same. A profile 20% filled in and
  a complete one need different screens.

Why: the four states you skipped are the ones a user hits on their worst day, when a network is
flaky or an account is new. That is the wrong moment for undefined behavior.

Attribution: Scott Hurff's UI Stack (ideal, empty, error, partial, loading), which credits
37signals' three-state solution of 2004 as its ancestor. Hurff states partial's job directly:
"prevent people from getting discouraged and giving up on your product". The four-state version in
wide circulation has no source. It is the UI Stack with partial dropped, and partial is the one
that gets shipped broken.

### 1.2 Isolate State Per Component

Each section owns its own data, its own loading state, and its own errors. One section failing
leaves the rest of the page working.

**Do:**
- Give a failed section its own error box and its own retry control, inside its own bounds.
- Render each section as soon as its own data arrives, and hold the still-waiting ones with a
  skeleton in their own bounds (§2.1). A profile with its header and follower counts up and a
  placeholder grid below is usable; the same screen behind one centered spinner is not.

**Don't:**
- Block the whole page on a global loading flag until every request resolves.
- Escalate one widget's failure into a full-page error that hides everything that did load.

Why: a dashboard where the revenue chart is down is still useful for everything else on it. A
full-page error throws away work that already succeeded. One screen's data usually comes from
several backends at different speeds, so a global flag paces every section to the slowest one.

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

That skeletons *feel* faster is unproven rather than refuted. The two studies usually cited are
reported to reach opposite conclusions, and neither is research anyone has been able to produce.
Use a skeleton for the layout reason above, not for perceived speed.

**WCAG 4.1.3 (AA):** a spinner that exists only as an animation reaches nobody using a screen
reader. Every loading indicator needs an accessible name and a live region, and a skeleton needs
marking so its placeholder shapes are not read as content.

### 2.2 Thresholds for Spinners

How long the wait is decides what to show. The 1 second and 10 second limits are measured, from
Miller 1968 and Card et al. 1991 by way of Nielsen. They describe human attention, so they have
not moved with hardware.

| Wait | Show | Why |
|---|---|---|
| Under 0.1s | Nothing | Reads as instantaneous |
| Up to 1s | Nothing, or just the result | A train of thought survives this uninterrupted |
| 1 to 10s | An indicator, with text naming the operation | Attention holds, but only if the screen proves it is working |
| Past 10s | Percent done, expected completion, and a way to cancel | Attention is gone; people switch tasks and need to know when to come back |

**Do:**
- Answer the click at the control itself in every band. A pressed state or a cursor change is not
  a loading indicator and does not count against the rows above; it is what stops someone
  concluding the click missed and clicking again.
- Reserve a looping animation for the 2 to 10 second band. Below 2s the loop is itself the
  distraction, and past 10s a loop no longer carries enough.
- Delay the indicator briefly before showing it, then hold it a short minimum. This reconciles a
  spinner on a button with the sub-1s rule: fast responses never flash one. No source gives a
  number for that delay, so pick one and keep it consistent rather than citing it as a threshold.
- Drop repeat activations for a short window after the first one. People double-click out of
  desktop habit, on a slow connection, or with a hand tremor, and the duplicate sends the
  invitation twice. The control stays enabled and focusable; only the extra event dies.
- Advance the text for long waits ("Connecting", "Fetching your data") so the screen proves
  something is still happening.
- Give anything past 10 seconds an interrupt. A user who cannot cancel a long operation is stuck
  watching it.

**Don't:**
- Flash a spinner for a 200ms response. The flicker reads as a glitch and makes the app feel
  slower than showing nothing would.
- Leave a bare looping animation running past 10s with no text, no progress, and no way out.
- Run a long wait and then resolve it into an error. Validate what you can before the wait starts.

Why: a spinner communicates "working" and nothing else. Past a few seconds that stops being
enough, and the user has no way to tell working from hung.

---

## 3. Errors

### 3.1 Say What Happened and How to Fix It

An error message has two jobs: name what failed, then give the next action. GOV.UK's rule is
exactly that pair, "describe what has happened and tell them how to fix it".

A third part, the reason, earns its place only where it changes what the user does next. "Your
card was declined" does. "The value you entered is invalid" does not; it is the message restating
that there is a message.

**Do:**
- Write both parts. "Enter your full name." "Your payment didn't go through. Check your card
  details or try a different payment method."
- Add the reason where the user can act on it: a declined card, an expired session, a file over a
  stated size limit.
- Keep the technical detail where engineers can reach it (logs, a correlation ID shown to the
  user) and out of the message itself.

**Don't:**
- Render backend text at the user. A raw exception is unreadable to most people and leaks
  internals worth keeping private.
- Ship "Something went wrong". It names nothing and suggests nothing.
- Ship a message that would fit any field. "Answer the question", "Select an option", "This field
  is required" identify nothing.
- Fail silently. A submit button that does nothing on click is the worst version, because the
  user cannot tell a broken app from a slow one.

**Words to cut**, from GOV.UK's error-message component: "valid" and "invalid" (they add nothing
to the message), "please" (implies a choice the user does not have), "sorry" (does not help fix
it), "oops" and other jokes (they go stale on an error people hit often), plus "forbidden",
"illegal", "prohibited", "you forgot". NN/g bans the same blame family: "Don't use phrasing that
blames users or implies they are doing something wrong, such as *invalid*, *illegal*, or
*incorrect*."

**WCAG 3.3.1 (A) and 3.3.3 (AA):** the failing item has to be identified and the problem described
in text, and where the fix is knowable you have to offer it. Both are what the message above
already does; the conformance part is that the text exists and is tied to the right control.

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

### 3.3 Failures Above the Screen

The five states are per screen. A service that is down, a URL that does not resolve, and a planned
outage are their own pages, and they are the ones nobody writes until the morning they are needed.

**Do:**
- Give a service-unavailable page the outage's shape: whether it was planned, when it ends, what
  the user can do meanwhile.
- Give a not-found page a way onward. Search, the section index, the home page.
- Keep these pages independent of the runtime that just failed. A failure page rendered by the
  broken app is a failure page nobody sees.

Source: GOV.UK's service-unavailable, page-not-found, and problem-with-the-service patterns.

---

## 4. Empty States

An empty screen explains why it is empty and offers the action that fills it.

**Empty is only reachable from a settled request.** This is a state-machine rule, not a copy rule,
and it is the most common way the class of bug ships. NN/g: "the system defaults to a misleading
system-status message: declaring that there are no items to display, only to replace it with
content after the process is completed." Its best case is that people wait it out and come away
distrusting the app. Its worst case, which NN/g attributes to most users, is that they act on the
first message and never see the content at all.

**Do:**
- Name the reason ("No projects yet"), then give the control that resolves it ("Create project").
- Treat a first-run empty state as onboarding. It is the one screen every new user sees, and it is
  where an unused feature has its best chance of being discovered.
- Offer a recovery path for empty search results: a correction, a broader query, a way back.
- Let a deliberately-cleared list read as an achievement rather than a void.

**Don't:**
- Render the empty state from an unsettled request. Loading and empty are different states with
  different copy, and conflating them makes the screen contradict itself.
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
- Build a consequential confirmation as a record, since that is how people use it. GOV.UK's
  must-include list: a reference number where there is one, what happens next and when, how to
  reach the service, links to whatever the user is likely to need next, a route to leave feedback,
  and a way to save a copy. Add a URL that still works when someone bookmarks it and comes back.

**Don't:**
- Let a consequential action resolve into a reset button and no other change. The user is left
  guessing whether they were charged.
- Put the reference number only in an email. The email is the thing that fails to arrive.
- Fire a full-screen celebration for a routine save. Overused, it becomes something to dismiss.

Why: uncertainty after an irreversible action is expensive. It sends people to support, or to
doing the thing twice.

**WCAG 4.1.3 (AA):** a success message that appears without taking focus needs `role="status"` to
reach a screen reader.

On optimistic UI, the objection is usability rather than conformance: a success message that was
never true is worse than a slower true one. If it later fails, the failure has to be identified
and described in text (3.3.1); a silent rollback fails that. Backing optimistic rendering with a
real undo is the version that holds up.

---

## 6. Undo and Confirmation

### 6.1 Every Mistake Needs a Way Out

Nielsen's third heuristic: "Users often perform actions by mistake. They need a clearly marked
'emergency exit' to leave the unwanted action without having to go through an extended process."

**Do:**
- Give a destructive or consequential action an undo, with a window long enough to notice the
  mistake. Delete, archive, send, bulk edit.
- Give a multi-step flow an exit that is not the back button: cancel, close, save and finish later.
- Make the undo reachable from where the result appears, so finding it is not its own task.

**Don't:**
- Count a confirmation dialog as the way out. It fires before the mistake, and it is the thing
  people click through on the way to making one.

**WCAG 3.3.4 (AA):** a payment, a legal commitment, or a change that modifies or deletes stored
data needs one of Reversible, Checked, or Confirmed. A real undo satisfies Reversible outright,
which makes it the cheapest of the three to build.

### 6.2 Confirm Only What Undo Cannot Cover

**The rule: undo by default, confirm when undo is impossible.** A charge that clears, an email
that leaves, a permanent deletion, anything with a side effect outside your system. Everything
else gets the undo instead.

NN/g: "confirmation dialogs constitute an interruption initiated by the system; they slow down the
user's task flow. If this delay prevents an error, then it's time well spent, but, if not, they
are disruptive and thus annoying." A dialog people dismiss without reading prevents nothing and
costs everyone.

**Do:**
- Name the specific target, never the count alone. NN/g: "Saying *these 2 items* doesn't tell
  users which files will be deleted."
- Put the consequence in the button. "Delete 3 files" beats "OK".
- Scale the friction to the damage. Ordinary destruction gets a confirmation; something with no
  recovery path at all earns retyping the name of the thing.

**Don't:**
- Confirm an action you could have made reversible.
- Confirm every step of a flow. Friction spent on the safe ones is friction unavailable where it
  matters, and it teaches people to click through.

---

## 7. Forms

### 7.1 Validate Where the Work Is

A field-level problem belongs at the field. *When* to check it is contested, and that argument is
at the end of this section rather than assumed here.

**Do:**
- Show constraints up front. Password rules render as a live checklist, not as a rejection after
  submit.
- Show a character count against its limit while typing.
- Confirm a field that passed, not only one that failed. It stops someone re-reading an answer
  they already got right. Widely recommended; no study of the positive signal on its own was
  reachable, so treat it as a default.
- Mark the *optional* fields. GOV.UK inverts the usual convention: "in most contexts, add
  '(optional)' to the labels of optional fields", and "never mark mandatory fields with
  asterisks". It gives no reason; the working one is that an asterisk is an unexplained glyph.
- On a failed submit: render an error summary at the top under the heading "There is a problem",
  move keyboard focus to it, prefix the page title with "Error:", and link each entry to its
  field. Word each summary entry identically to the message beside its input, since a reader who
  follows the link and meets different wording has to work out whether it is the same problem.
  Keep every answer the user already gave, passing and failing both.

**Don't:**
- Disable the submit button. A disabled button is not focusable, so someone tabbing through cannot
  reach it to find out why it is dead; it has poor contrast; and a user who fixes the last field
  may never notice it came alive. GOV.UK: "Disabled buttons have poor contrast and can confuse
  some users, so avoid them if possible." Let the submit happen and answer with an error summary.
  If you must disable, `aria-disabled="true"` keeps the button focusable where the native
  `disabled` attribute does not, but it only labels the state: drop the native attribute and
  block the submit in your own handler, or you have shipped a button that still fires.
- Clear fields on a validation failure. Making someone retype a correct answer because a different
  one was wrong is the fastest way to lose them.
- Let someone exceed a limit freely and discover it only at submit.

**When to validate is genuinely contested.** GOV.UK says wait for submit: "Do not validate when
the user moves away from a field. Wait until they try to move to the next part of the service."
Baymard's testing supports on-blur: "the validity of each field input should be checked when the
user leaves the field." Both camps agree on the negative, so treat that as the rule: never raise
an error against a field the user has not finished with.

A constraint display is not validation. The live password checklist and the character counter
above show progress toward a valid answer; neither raises an error, so neither is inside this
argument.

Two on-blur bugs to handle if you go that way: a password manager filling a field fires blur and
shows an error prematurely, and a value split across several inputs (a date, a card number) has no
single meaningful blur.

**WCAG 3.3.2 (A) and 4.1.2 (A):** every input carries a label or instructions, and required and
invalid states are exposed programmatically. A red border and an asterisk are visual conventions
that carry no meaning to assistive tech on their own.

### 7.2 Ask Once, and Ask for One Thing at a Time

**Do:**
- Start at one question per page. GOV.UK: "Asking just one question per question page helps users
  understand what you're asking them to do, and focus on the specific question and its answer."
  Splitting a long form has an institutional source of its own; it does not need Hick's Law
  (§8.2). Treat any conversion percentage quoted alongside it as unsourced until you see the study.
- Pre-fill anything the user already gave you in this flow. **WCAG 3.3.7 (A)** makes that a
  conformance requirement rather than a courtesy, and browser autofill does not discharge it: the
  content has to supply the value.
- Keep the browser back button working, and put a back link on the page too. Back returns to the
  previous page in the state the user left it, with the documented exception of a step whose
  action has already been performed.
- Warn before a session expires, and let the work survive it. **WCAG 2.2.1 (A)** requires a way to
  turn off, adjust, or extend any time limit the content sets.

**Don't:**
- Ask for the same information twice in one flow.
- Break the back button. A flow that discards answers on back is a flow people restart, or abandon.

### 7.3 Submit, Then Confirm

**Do:**
- Validate on the server whatever the client already did. GOV.UK: "there's no guarantee that
  client side validation will work in all circumstances. For example, the user can bypass client
  side validation, or JavaScript can fail to load."
- Show a review step before anything consequential submits: every answer, each with a link back to
  the page that set it. It catches errors while they are still cheap, and it is the mechanism
  WCAG 3.3.4's Confirmed option asks for.
- Drop duplicate submits (§2.2), then land on the confirmation contract in §5.

**Don't:**
- Leave HTML5 validation on when you have written your own. The browser's messages cannot be
  styled, placed, or worded to match yours, so `novalidate` on the form keeps one voice. This is a
  GOV.UK position; a product with light validation can reasonably keep the native path.

### 7.4 Accept What People Type

Normalize input instead of rejecting it.

**Do:**
- Accept a phone number with spaces, dashes, parentheses, or none, then normalize server-side.
- Trim whitespace, accept both letter cases, tolerate a pasted value carrying formatting.

**Don't:**
- Reject a semantically valid value over its punctuation. The user has given you the right answer
  and you have said no.

Why: format rejection is the cheapest failure to eliminate. The parsing is a few lines and it
removes an entire class of user error.

### 7.5 Credentials

**Do:**
- Let people paste into a password or one-time-code field. **WCAG 3.3.8 (AA)** names password
  managers and copy-paste as the mechanisms that keep authentication off memory, so blocking paste
  is a conformance problem before it is a usability one.
- Set a minimum length of at least 8 characters, per GOV.UK. Set no maximum: a cap breaks
  generated passwords, and a cap that exists at all suggests the password is being stored rather
  than hashed.
- Say the sign-in failed without saying which half was wrong.
- Clear the password field after a failed sign-in. This is the documented exception to keeping the
  user's answers; every other field stays filled.

**Don't:**
- Force periodic password changes. It buys nothing and it produces the same password with a
  rising digit.

---

## 8. Cognitive Load

### 8.1 Jakob's Law: Meet the Existing Expectation

Users spend most of their time on other products, so they expect yours to work like those.

**Do:**
- Establish what the convention is by looking at the products your users already use. A convention
  is observable; a remembered one is a guess.
- Put a standard control where that convention puts it, and spend novelty budget on what makes the
  product different.

**Don't:**
- Move a standard control to be distinctive. The cost lands on every user, every session.
- Repeat a convention you have not checked. "The cart goes top right" is probably true and
  presently uncited: no reachable published source states a conventional cart position. That is
  what most placement folklore looks like from the inside.

Attribution: the phrase is Jakob Nielsen's own coinage, restating his fourth heuristic,
Consistency and Standards: "Users should not have to wonder whether different words, situations,
or actions mean the same thing. Follow platform and industry conventions." The research sits under
the heuristic set, refined from a factor analysis of 249 usability problems, not under the
aphorism. Which placement counts as conventional differs between desktop and phone, and between
left-to-right and right-to-left locales; see `references/mobile.md`.

### 8.2 Hick's Law: Fewer Visible Choices

Decision time grows with the number and complexity of options.

**Do:**
- Cut a long option list to the ones that matter, and let search or filters reach the rest.
- Keep item positions stable. A menu that reorders itself, or one led by a "recent" block that
  moves, never becomes learnable, so it stays at novice search speed forever, for everybody.
- Give the expert path a shortcut: a key binding, a saved view, a repeat-last-action. That is
  where the speed actually lives, and it costs a novice nothing while it stays out of the way.
  Nielsen's seventh heuristic: "Shortcuts ... may speed up the interaction for the expert user."
- Curate rather than enumerate. A short recommended set beats the full catalog.

**Don't:**
- Render a 200-item menu and call it complete.
- Put every category into one dropdown because the data model has them.

Attribution, and it does not hold up as usually applied: Hick and Hyman timed decisions in
response to clear visual stimuli with a known, pre-learned option set. Using the law to model menu
search is a documented misuse, and the real cost is worse than the law implies. A novice's search
time is linear in menu length rather than logarithmic, and the logarithmic regime arrives only
once the user is expert and the items have stayed where they were. Cut the list because searching
it is slow, not because a law says so.

### 8.3 Progressive Disclosure: Show What Is Needed Now

Surface what the current step requires. Keep the rest one interaction away.

**Hide by frequency of need, never by importance.** That is this skill's tie-break between
disclosure and Nielsen's sixth heuristic, recognition over recall ("Minimize the user's memory
load by making elements, actions, and options visible"). The heuristic is Nielsen's; the tie-break
is not, and no source states one. The two pull in opposite directions and frequency is what
settles them in practice: a rarely-used option behind a disclosure is fine, an option the user has
to remember exists is not. So the control that opens the disclosure stays visible even when its
contents do not.

**Do:**
- Reveal advanced options on request rather than by default.
- Let typing filter a large option set, so the full list never needs rendering at once. A
  slash-command menu is this pattern.
- Ask of every element on a screen whether it is needed at this moment.
- Carry context forward instead of making the user hold it. A confirmation naming what it is about
  to delete is recognition; "are you sure?" is recall.
- Put help where the task is. Nielsen's tenth heuristic accepts that documentation is sometimes
  necessary, and a field hint or an empty state is where it belongs before a help section is.

**Don't:**
- Bury the primary action behind the disclosure. Hiding complexity is the goal; hiding the main
  path is a different mistake with the same mechanism.
- Replace a long list with a long list behind a click.

### 8.4 Tesler's Law: Absorb the Complexity

Inherent complexity cannot be removed, only moved. Decide who carries it.

**Do:**
- Take the burden into the system. Detect the intro's timestamps and offer one skip control.
  Remember the card. Infer the timezone.
- Weigh it honestly: an engineer's week against a minute of every user's time, repeated.

**Don't:**
- Export a modeling problem to the user as a form field. A required field that exists because the
  backend needs disambiguation is complexity you declined to absorb.

Attribution: Larry Tesler, through an interview in Dan Saffer's *Designing for Interaction*. His
framing, that a million users each wasting a minute on something an engineer could have solved in
a week is a penalty charged to the wrong party, is an argument rather than a measurement, and it
carries a published counter. Bruce Tognazzini holds that people resist reductions in the
complexity of their lives, so a simplified application just gets used for harder tasks and the
saved minute is never banked. Absorbing complexity is still the right default. Expecting the
arithmetic to land is not.

---

## 9. The Ten Heuristics as a Review Pass

Nielsen's ten, unchanged since 1994 and derived from a factor analysis of 249 usability problems.
They sort by failure mode where this skill sorts by state, so they work as an audit sweep rather
than as a section. Each row points at where its rule lives here.

| # | Heuristic | Where it lives |
|---|---|---|
| 1 | Visibility of system status | §2, §5 |
| 2 | Match between system and the real world | §3.1 |
| 3 | User control and freedom | §6.1 |
| 4 | Consistency and standards | §8.1 |
| 5 | Error prevention | §6.2, §7 |
| 6 | Recognition rather than recall | §8.3 |
| 7 | Flexibility and efficiency of use | §8.2 |
| 8 | Aesthetic and minimalist design | §8.3 |
| 9 | Help users recognize, diagnose, and recover from errors | §3.1 |
| 10 | Help and documentation | §8.3 |

---

## Quick Reference

| Area | Do | Don't |
|---|---|---|
| **States** | Build loading, success, error, empty, partial for every screen | Ship the happy path and let the framework decide the rest |
| **Partial** | Handle sparse data as its own state, naming what is missing | Rendering three rows through a layout built for twenty |
| **Failure scope** | Each section owns its data, loading, and errors; render what has arrived, skeleton the rest | One global flag pacing the page to its slowest backend; one widget's failure taking down the whole page |
| **Loading type** | Skeleton for regions, progress bar for knowable waits, inline spinner for one control | A spinner on a file upload |
| **Loading timing** | No loading indicator under 1s; text with the indicator from 1 to 10s; percent done, ETA and a cancel past 10s | Flashing a spinner on a 200ms response; a bare loop past 10s with no way out |
| **Click feedback** | Acknowledge at the control, then drop duplicate submits | A dead-feeling button that sends the request twice |
| **Error content** | What happened, then what to do next | Raw backend text, "Something went wrong", "please", "sorry", "invalid" |
| **Error placement** | Inline by default; modal only when actually blocked | Important errors as toasts; modals for emphasis |
| **Empty** | Name the reason, offer the action that fills it; reachable only from a settled request | Empty rendered mid-load; a blank region; bare "No results found" |
| **Success** | Scale to the action; give a consequential one a reference number and a saveable record | Nothing at all after a payment; confetti for a save |
| **Undo** | Undo by default; confirm only what undo cannot cover | A confirm dialog on a reversible action; "OK" instead of "Delete 3 files" |
| **Forms** | Show constraints live, mark optional fields, answer a failed submit with a focused error summary | Disabling submit; clearing fields on failure; asterisking required fields |
| **Submission** | Validate server-side always; review step before anything consequential | Trusting client-side validation; HTML5 messages mixed with your own |
| **Credentials** | Allow paste, no max length, clear only the password after a failed sign-in | Blocking paste; forced rotation; naming which half was wrong |
| **Input** | Normalize formatting server-side | Rejecting a valid value over its punctuation |
| **Convention** | Standard controls where the products your users know put them | Novelty spent on relocating basics; citing folklore as convention |
| **Choice** | Cut, filter, curate, keep positions stable, give experts a shortcut | 200-item menus; a nav that reorders itself |
| **Disclosure** | Hide by frequency of need; advanced options on request | Hiding by importance; the primary action behind a reveal |
| **Complexity** | Absorb it into the system | A form field that exists for the backend's benefit |
| **Announcing** | `role="status"` or `role="alert"` on anything that appears without taking focus | A spinner, toast, or success message that exists only as pixels |
| **Modals** | Focus in on open, back on close, Escape to dismiss | A dialog you can tab out of behind the overlay |
