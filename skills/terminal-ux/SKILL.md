---
name: terminal-ux
description: "Behavior rules for CLIs and TUIs: exit codes, stdout vs stderr, TTY detection, NO_COLOR, progress output, help conventions, destructive-action confirmation, signal and panic/crash recovery, screen-reader concerns. Use when writing or reviewing a CLI, TUI, argument parsing, prompts, or terminal color handling."
metadata:
  author: uwuclxdy
  version: "1.3"
---

# Terminal UX

How a terminal program should behave. Two different things live here and their rules diverge:

- **CLI**: a command that runs, prints, and exits. No persistent screen. State is communicated by printing what changed.
- **TUI**: a full-screen interactive app that owns the terminal until it quits. A grid that redraws.

Every rule below says which it applies to. A CLI rule does not automatically hold for a TUI, and the sources differ: `clig.dev`, the 12-factor CLI writeup, GNU, and POSIX are CLI-first, while the TUI material comes from ratatui, Bubble Tea, Textual, and accessibility practitioners.

How solid a rule is:

- **convention**: documented in a widely-adopted guide or standard.
- **house style**: one project's stated choice. Reasonable, not universal.
- unmarked: reasoning by analogy from graphical UI, with nothing behind it. Weigh it lower.

Terminal accessibility gets its own file, `references/accessibility.md`. There is no WCAG equivalent for terminals, so nothing there is a conformance floor. Read it anyway: it holds the one rule most likely to make a TUI unusable for someone.

---

## 1. Output Streams

**CLI, convention.** stdout carries the program's actual output. stderr carries everything about the run.

**Do:**
- Put primary output, the thing another program would consume, on stdout.
- Put logs, warnings, errors, and human-watched progress on stderr, so a pipe does not swallow them and they do not corrupt the data stream.
- Surface a subprocess's stderr to the user rather than eating it.

`curl`'s progress meter goes to stderr despite not being an error, because it is messaging about the run rather than the payload.

**A machine-readable output format is a TRUST BOUNDARY, and the boundary rule reads as though it only covers input.** Any user-supplied bytes entering a line-oriented or delimited format need quoting AT THE PRINTER, never a narrowing of what the input layer accepts. A `key=value` printer whose value is a path straight off argv, with nothing escaped, emits forged keys ahead of the real ones the moment that path contains a newline, at exit 0, and a first-wins reader believes them. Measured 2026-08-11 against a shipped flag: `--source=$'/tmp/x\nparts=one'` produced a verdict about a directory that does not exist. Quote or escape every value, or emit a format that carries its own quoting (json, NUL-delimited) rather than one that trusts its payload.

**TUI, house style.** The question is different: which stream do you paint to. ratatui recommends stdout, so that `app | grep foo` renders nothing and fails visibly like other commands. Painting to stderr keeps the interface alive when stdout is piped, which is unconventional and costs performance. Bubble Tea and Textual take no documented position.

---

## 2. Exit Codes and Errors

**CLI, convention.** Zero on success, non-zero on failure, with distinct codes for the failure modes that a script would want to branch on.

An error message carries: what failed, a human description, how to fix it, and where to read more.
`clig.dev` and the 12-factor writeup describe the same anatomy independently.

**Do:**
- Rewrite expected errors for humans. Treat it as guiding someone who did something wrong, not as reporting an exception.
- Put the most important line last. The eye lands at the end of the output.
- Collapse repeated identical errors under one header.
- Keep tracebacks and debug dumps behind a flag or an env var. Log files get timestamps, get truncated, and carry no ANSI codes.
- Print the logs you hid behind a progress bar when the run fails. Success can stay quiet;
  failure cannot, or debugging is impossible. A successful run may print nothing.

**Don't:**
- Exit zero on a failure because the program technically finished.
- Show a stack trace by default.

---

## 3. Interactivity

**CLI, convention.** Prompting is only safe when someone is there to answer.

**Do:**
- Check that stdin is a TTY before prompting. If it is not, fail with a message naming the flag to pass instead of hanging.
- Give every interactive path a flag equivalent, so the command stays scriptable.
- Honor `--no-input` by disabling all prompts.
- If the command expects piped stdin and gets an interactive terminal instead, print help and quit rather than hanging like `cat`.

**Don't:**
- Require a prompt for anything. A command that cannot run unattended cannot be automated.

**TUI, convention.** A full-screen app needs a TTY to exist at all. The move that matters is an opt-out: an env var or flag that drops the full-screen interface for linear prompts. `huh` ships this as `ACCESSIBLE`, and it is the cheapest accessibility win available to a TUI.

---

## 4. Color

**Both, convention.** Color is decoration over a text stream, and plenty of contexts cannot show it.

Turn color off when any of these hold:

- stdout or stderr is not a TTY (check them independently; color can be right on one and wrong on the other)
- `NO_COLOR` is set to any non-empty value
- `TERM` is `dumb`
- `--no-color` was passed, or your app's own `MYAPP_NO_COLOR` is set

`NO_COLOR` governs color only. Bold and underline are not covered by it.

**Do:**
- Use the terminal's indexed ANSI-16 palette rather than hardcoded truecolor, so the user's own theme, contrast settings, and colorblind-safe scheme win. GitHub CLI aligned its whole palette to 4-bit colors for exactly this reason.
- Detect a light or dark background at runtime and pick to match, rather than assuming one.
- Use color to signal. Coloring everything highlights nothing.
- Encode state in a glyph, a label, or a position as well as in color.

**Don't:**
- Render animation when stdout is not a TTY. That is what turns progress bars into thousands of lines of garbage in CI logs.

---

## 5. Progress and Long Operations

**CLI, convention.** Silence reads as broken. Show something when work takes a while, and prefer a real progress bar to a bare spinner whenever the work is countable. A stalled progress bar is worse than none, so show an ETA or a current item.

**CLI, house style.** oclif's latency bands for a command's own startup: under 100ms is very fast, 100 to 500ms is the target, 500ms to 2s is usable, past 2s people avoid the tool. This is process startup, a different axis from how long to wait before showing an indicator.

**Both.** Parallel work needs a real multi-progress implementation. Hand-rolled interleaved output across concurrent tasks is a known trap.

**Accessibility, and this one overrides the visual advice.** An animated spinner that redraws by moving the cursor, including the braille-cycling kind, is actively hostile to a speech-synthesis screen reader, which announces every tick. GitHub replaced theirs with a static text indicator naming the action. Do the same: a static line that updates rarely, or an accessible mode that degrades to one. See `references/accessibility.md`.

---

## 6. Help and Discoverability

**CLI, convention.** `-h` and `--help` are reserved for help and nothing else. Help must be reachable as `myapp`, `myapp --help`, `myapp -h`, and `myapp help`, and the same for every subcommand.

**Do:**
- Print concise help when a command that needs arguments gets none: a description, one or two real invocations, and a flag summary. Save the full listing for `--help`.
- Send `--help` and `--version` to stdout and exit successfully, ignoring other arguments once either is seen (GNU standard).
- End `--help` with where to report bugs and where the project lives (GNU standard).
- Ship shell completion. It is a discovery mechanism, not just a convenience. One subcommand generates the script off the parser and prints it to stdout. The user wires it up, so nothing writes to a shell rc on their behalf:

  ```sh
  # .bashrc
  source <(mycli completions bash)
  # .zshrc
  source <(mycli completions zsh)
  # fish
  mycli completions fish > ~/.config/fish/completions/mycli.fish
  ```

**TUI, convention.** Discoverability is a visible keybinding footer plus a searchable command palette, not a printed help block. Keys that do nothing in the current state get hidden or greyed rather than displayed as though they work.

---

## 7. Destructive Actions

**CLI, convention.** Scale the friction to the damage. This is the most fully worked-out rule in the CLI canon.

| Danger | Confirmation |
|---|---|
| Mild | Possibly none |
| Moderate | Confirm, and offer a dry run |
| Severe | Require typing the target's name, not a `y/n` |

**Do:**
- Give every confirmation a scriptable override: `--force`, or better, `--confirm="name-of-thing"` so automation still states what it is destroying.
- Treat a non-obvious cascade as severe. Changing one number that silently deletes nine things is a severe action that does not look like one.

**Don't:**
- Require an interactive prompt. That breaks every script that calls you.

**TUI, convention.** The equivalent primitive is a modal screen: it dims but keeps the background visible, captures all key input, and needs an explicit action to leave. Textual's `ModalScreen` is this pattern. Never draw one without a visible way out.

---

## 8. Signals and Crash Safety

**CLI, convention.** On `SIGINT`, exit as fast as you can. Say something before cleanup starts, give cleanup a timeout so it cannot hang, and skip remaining cleanup on a second Ctrl-C. If that second press leaves things in a destructive state, say so before it happens.

**CLI, gotcha.** A reader that walks away mid-pipe is not a failure of the run. Rust ignores `SIGPIPE`, so a write to a pipe whose reader left comes back `EPIPE`, and the std print macros panic on it: `prog | head -3` exits 101 with a panic message instead of just stopping. The signal disposition fix is wrong for a binary that doubles as a server, so handle it at the emitter. The payload stream exits 0, since the reader chose to leave and `head` already printed what it wanted.
The diagnostic stream swallows the `EPIPE` and keeps the run's own exit code. Splitting by stream is not enough: a background log sink must swallow every write error, or one full disk ends a worker thread.

**TUI, convention.** A panic that unwinds without restoring the terminal leaves the user with a broken shell: raw mode still on, still in the alternate screen. Install a panic hook that disables raw mode and leaves the alternate screen before anything else runs. ratatui documents this per backend and treats it as mandatory rather than optional.

---

## 9. TUI Keyboard Conventions

**Convention, from what shipped apps actually bind:**

| Key | Meaning |
|---|---|
| `q` or `Ctrl+C` | Quit |
| `Ctrl+Q` | Quit, working regardless of focus. Textual reserves it framework-wide |
| `Escape` | Dismiss the current modal or pop the current screen |
| `Tab` / `Shift+Tab` | Move focus. Assumed known, so conventionally hidden from the footer |

**Gotcha.** Not every combination reaches your app. Terminals and operating systems intercept some, and which ones differ per terminal and per platform. Test what actually arrives rather than designing a binding scheme on paper.

---

## 10. TUI Screen Behavior

The rules in this section are reasoning carried over from graphical UI, not sourced from any terminal project. They match how ratatui and Bubble Tea work, and no source contradicts them, but none states them either.

**Confirmed mechanism:** both ratatui and Bubble Tea rebuild the entire visible interface from application state every frame. There is no widget tree to patch.

**Reasoning from there:**

- Reserve the loaded height while loading, so the frame does not jump when data replaces a placeholder. A one-line "Loading..." where twenty rows will appear moves everything below it.
- Give each pane its own loading, populated, partial, error, and empty state, and keep a failure inside the pane that owns it. Partial is the one that gets skipped: three rows in a pane sized for twenty reads as finished rather than as thin.
- An empty pane names both the reason and the key that fills it. `No sessions yet. Press n to start one.` A key that is never named is invisible. Textual's convention is a persistent footer instead; either resolves the same problem.
- A reserved status line is the closest thing to a toast. Keeping it permanently reserved means a message appearing never reflows the layout.
- Textual's title and subtitle region is a worked example of holding persistent state without it being a transient message.

For what a pane should show and why, the **ux-patterns** skill covers states, error anatomy, and progressive disclosure at the level above this one. Load it if installed.

---

## Quick Reference

| Area | Do | Don't |
|---|---|---|
| **Streams** | Output on stdout, everything about the run on stderr | Progress or logs on stdout, corrupting a pipe |
| **Exit** | Zero on success, distinct non-zero codes per failure mode | Exiting zero because the process finished |
| **Errors** | What failed, why, how to fix, where to read more; important line last | Default stack traces; repeating the same error N times |
| **Prompts** | Check stdin is a TTY; give every prompt a flag equivalent | Requiring interaction; hanging when piped |
| **Color** | Off when piped, `NO_COLOR`, `TERM=dumb`, or `--no-color`; indexed palette | Hardcoded truecolor; animation into a CI log |
| **Progress** | Determinate bar when countable; static text when a screen reader may be listening | Cursor-redraw spinners as the only option |
| **Help** | `-h`/`--help` reserved, concise by default, bug URL at the end | Requiring a man page to learn the tool |
| **Destruction** | Friction scaled to damage; typed confirmation for severe; always overridable | An interactive-only confirmation that breaks scripts |
| **Signals** | Exit fast on Ctrl-C, timeout the cleanup, skip it on the second press | Trapping Ctrl-C into a hang |
| **Crash** | Panic hook restores the terminal before anything else | Leaving raw mode on and the user's shell broken |
| **Keys** | `q`/`Ctrl+C` quit, `Escape` dismiss, footer shows live bindings | Assuming every combination reaches your app |
