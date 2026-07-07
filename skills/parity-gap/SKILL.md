---
name: parity-gap
description: Compare the current program against a reference project, spec, or feature list; produce a parity + improvements gap list, confirm scope through question rounds, then write tasks to docs/todo.md via the todo skill. Use when the user wants to match, catch up to, reach parity with, or surpass another project.
---

Compares the current program against a reference (local codebase OR a docs/spec/feature list), produces a parity + improvements gap list, confirms scope through rounds of clarifying questions, then writes the result to docs/todo.md via the `todo` skill.

# parity-gap

Bring `this program` (default: cwd) up to — and past — a `reference`. Map both sides, diff them, **confirm scope in rounds of 4 questions before writing anything**, then author tasks into `docs/todo.md` through the `todo` skill.

## 1. Resolve the two inputs first

- **this program** — default to the working directory unless the user names another.
- **reference** — one of:
  - a **local codebase** (path on disk) — read its tree, entrypoints, commands, modules.
  - a **docs/spec/feature list** (file or pasted text) — treat each described capability as a reference feature.
- If either is ambiguous (which repo? which spec?), ask before mapping — do not guess the reference.

## 2. Map each side (inline, single-pass)

Build a capability inventory for both — not a file listing. Capture user-reachable surface, not internals:

- commands / subcommands / flags
- exported APIs, routes, endpoints
- config keys, env vars
- UI/TUI/CLI surfaces and the actions they expose
- notable behaviors, formats, integrations

Use `Grep`/`Read`/semantic code search inline. The reference is the spec side, so read it thoroughly; the program is the have side. If the reference is too large to hold inline, offload its mapping to a **single** `Explore` subagent and work from the returned inventory — keep the diff itself in the main thread.

## 3. Diff into two buckets

- **Parity gaps** — capabilities the reference has that this program lacks. The core of the output.
- **Improvements** — things that would go *beyond* the reference (better defaults, missing affordances the reference itself lacks, obvious wins surfaced while mapping). Kept separate and clearly flagged — never silently mixed into parity.

Drop anything the program already has. Note cascade order where one gap blocks others.

## 4. Confirm scope — rounds of 4

**Before writing a single task**, run clarifying questions through `AskUserQuestion`, **max 4 per round**, looping rounds until scope is nailed. This gate is the point of the skill — the user reviews the gap list as questions, not as a finished file.

Each round, ask about the highest-leverage unknowns:

- which gaps are actually in-scope vs intentionally-omitted (the program may skip a reference feature on purpose)
- ambiguous parity calls — match the reference's behavior exactly, or adapt it?
- which improvements to include vs drop
- depth — every gap, or only a named subset / surface

Guidance:
- Use `multiSelect: true` when the user is picking which of several gaps/improvements to keep.
- Put a recommended option first, labelled `(Recommended)`.
- Batch genuinely-independent questions into one round; don't trickle one at a time. Keep looping rounds while real ambiguity remains, stop as soon as it doesn't — don't pad to fill four.
- Never park an unresolved decision inside a task (the `todo` skill forbids it); resolve it here in a round instead.

## 5. Write via the `todo` skill

Once scope is confirmed, hand authoring to the **`todo`** skill — do not invent a separate format. Map the buckets onto its two formats:

- **Parity gaps** → punch-list under `# <reference> parity punch-list`, with one-line provenance (what was compared against what, date). Group by feature area; note cascade order.
- **Improvements** → a clearly-marked checkbox-spec section (e.g. `## Beyond <reference>`), kept distinct from parity tasks.

Honor every `todo` rule: each task independently executable by a fresh agent, states **what** (and optionally **how**) but never **where**, sized to one agent / one clean commit. Tasks confirmed out-of-scope in the rounds don't get written.

## Boundaries

- This skill owns analysis + the question gate + dispatch. The `todo` skill owns the file format and bookkeeping. Resolution/execution runs via your multi-task runner or workflows, one task each.
- Plain note-dumps with no reference to catch up to → go straight to `todo`, skip this skill.
