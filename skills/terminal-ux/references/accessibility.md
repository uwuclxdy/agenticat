# Terminal Accessibility

There is no WCAG equivalent for terminals. GitHub's engineering team looked for one and said so:

> While standards like the Web Content Accessibility Guidelines (WCAG) provide a clear path for > making web and graphical applications accessible, there is no equivalent, comprehensive standard > for the terminal and CLIs. The W3C offers some high-level guidance for non-web software, but it > stops short of prescribing concrete techniques.

So nothing here is a conformance floor. It is documented practice from people who shipped fixes, plus one detailed practitioner account. Weigh it as evidence, not as a rule you can cite.

## The Shape of the Problem

A CLI is close to ideal for a screen reader by construction. A TUI fights it.

> The CLI (The Stream): This operates on a standard input/output model (stdin/stdout). You type a > command, the system appends the result below, and the cursor moves down. This is linear and > chronological. For a screen reader... this is ideal. The TUI (The Grid): This treats the terminal > window not as a stream of text, but as a 2D grid of pixels... It abandons the temporal flow for a > spatial layout.

Practitioner consensus is that command-line accessibility on Linux is solved at the shell level. The open problems are all in full-screen apps and in terminal emulator choice.

## Cursor Discipline

The single biggest lever. A screen reader follows the cursor, so a cursor that jumps around the screen to repaint distant regions produces noise instead of information.

The working examples are `nano`, `vim`, and `menuconfig`, and what they share is not perfect handling:

> The answer is that they allow you to hide the cursor entirely... [In menuconfig] the cursor stays > pinned to that list. It doesn't jump to the bottom right to update a clock, then to the top left > to update a title. The spatial complexity is kept low enough that the screen reader never gets > "lost."

**Do:**
- Let the cursor be hidden, or pin it to the one list or field the user is working in.
- Keep it there. A cursor that leaves to repaint a timer and comes back has already cost the read.

## Animated Indicators Are the Common Failure

This one has a shipped fix from a major vendor. GitHub CLI:

> Our existing implementation uses a "spinner" made by redrawing the screen to display different > braille characters (yes, we appreciate the irony) to give the user the indication that their > command is executing. Speech synthesis screen readers do not handle this well... This has been > replaced with a static text progress indicator (with a relevant message to the action being taken > where possible, falling back to a general "Working…" message).

The mechanism, independently described:

> When the AI is "thinking," the tool updates a timer or a spinner. To do this, it moves the > hardware cursor to the timer location, writes the new time, and moves it back. For a sighted > user, this happens instantly. For a screen reader user, this is what you hear: "Responding...
> Time elapsed 1s... Responding... Time elapsed 2s..."

**Do:**
- Use a static text line naming the action, updated rarely, instead of a per-tick redraw.
- If you want the animation for sighted users, gate it behind the accessible-mode check below.

**Don't:**
- Ship a cursor-redraw spinner or a live elapsed-time counter as the only progress affordance.

## The Escape Hatch

The cheapest thing a TUI can do. Detect an environment variable or flag and drop the full-screen interface for linear prompts. `huh` ships exactly this:

> Accessible forms will drop TUIs in favor of standard prompts, providing better [screen reader > support]. We recommend setting this through an environment variable or configuration option to > allow the user to control accessibility: `accessibleMode := os.Getenv("ACCESSIBLE") != ""`.

A full-screen app with no linear fallback has no accessibility story at all.

## Color

Use the terminal's indexed ANSI-16 palette rather than hardcoded truecolor, so a user's own high-contrast or colorblind-safe theme applies. GitHub aligned its whole palette for this:

> most terminals only support changing a limited subset of colors: namely, the sixteen colors in > the ANSI 4-bit color table. The GitHub CLI has made extensive efforts to align our color palettes > to 4-bit colors so our users can completely customize their experience using their terminal > preferences.

Never carry meaning in color alone.

## What You Cannot Fix From Inside the App

The host terminal decides a lot of this, and a practitioner report found large differences:

> terminator is fully accessible, including split windows... because terminator uses separate GUI > widgets for each split pane, unlike terminal agnostic split solutions like tmux and screen, > creating vertical panes does not result in the screen reader reading both the line on the left > and the line on the right where the cursor is at... QT based terminals are to my knowledge not > accessible at all.

So a user inside `tmux` splits may get jumbled output no matter what your app does. Worth knowing before attributing a report to your own code. This is one first-person account, not corroborated.

## Open

Structured and tabular output is flagged by GitHub as unsolved rather than solved. No source in this pass offers a working pattern for reading a table aloud.

## Sources

- GitHub Engineering, Building a more accessible GitHub CLI: `https://github.blog/engineering/user-experience/building-a-more-accessible-github-cli/`
- The Inclusive Lens, The text mode lie: `https://xogium.me/the-text-mode-lie-why-modern-tuis-are-a-nightmare-for-accessibility`
- Blind Computing, The State of Linux Command Line Accessibility: `https://blindcomputing.org/linux/state-of-cli-accessibility/`
- charmbracelet/huh README, accessibility section

ratatui's own documentation says nothing about accessibility. That is a silence, not a position.
