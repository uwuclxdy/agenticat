---
name: parity-gap
description: "Diff a program against a reference or spec and write the gaps as tasks. Use when matching, catching up to, reaching parity with, or surpassing another tool. Writes the gap list into `docs/todo.md`."
metadata:
  author: uwuclxdy
  version: "1.3"
---

# Parity Gap

Bring `this program` (default: cwd) up to (and past) a `reference`. Map both sides, diff them, **confirm scope in rounds of 4 questions before writing anything**, then author tasks into `docs/todo.md`, via the `todo` skill if installed or directly otherwise.

## 1. Resolve the Inputs First

- `this program` defaults to the working directory. Name another explicitly to override.
- `reference` is one of:
  - a remote repository: clone it into a temp dir then treat as local codebase.
  - a local codebase (path on disk): read its tree, entrypoints, commands, modules.
  - a docs/spec/feature list (file or pasted text): treat every command, endpoint, flag, or behavior it describes as a reference feature.
- If either is ambiguous (which repo? which spec?) or the reference can't be reached once identified (private, no network, no read access), ask anything and no guesses before mapping.

## 2. Map Each Side (Inline, Single-Pass)

Map what each side exposes to a user; skip internals and file structure. The user-reachable surface:

- commands / subcommands / flags
- exported APIs, routes, endpoints
- config keys, env vars
- UI/TUI/CLI surfaces and the actions they expose
- notable behaviors, formats, integrations

Use `Grep`/`Read`/semantic code search inline. The reference is the spec side, so read it thoroughly; the program is the have side. If the reference is too big to hold inline, offload its mapping to a read-only exploration subagent (e.g. `Explore`) and diff from the returned inventory.

## 3. Diff into Two Buckets

- Parity gaps: capabilities the reference has that this program lacks. The core of the output.
- Improvements: things beyond the reference (better defaults, affordances the reference itself lacks, wins spotted during mapping). List these in their own section; never mix them into the parity list.

Drop anything the program already has. Note cascade order where one gap blocks others.

## 4. Confirm Scope

**Before writing a single task**, run clarifying questions through `AskUserQuestion` (max 4 per round, batched rather than trickled), looping rounds until scope is nailed. (On other harnesses, check for a native equivalent first: opencode's `question` tool, gemini-cli's `ask_user` tool, or codex's `request_user_input` [Plan Mode only]. Fall back to a plain numbered message and wait for answers only if none is available.) This gate is the point of the skill: the user reviews the gap list as questions, not as a finished file.

Each round, target the unknowns that matter most:

- which gaps are in scope versus intentionally omitted (the program may skip a reference feature on purpose)
- ambiguous parity calls (match the reference's behavior exactly, or adapt it?)
- which improvements to include vs drop
- depth (every gap, or only a named subset / surface)

Guidance:
- Keep looping rounds while real ambiguity remains and stop as soon as it doesn't. Four is a ceiling, not a quota; never pad a round to fill it.
- Use `multiSelect: true` when the user is picking which of several gaps/improvements to keep.
- Put a recommended option first, labelled `(Recommended)`.
- Never park an unresolved decision inside a task; resolve it here in a round instead. Next session should be able to start implementing everything that gets decided now.

## 5. Write a Todo

Once scope is confirmed, write the gap list: if the `todo` skill is installed, load it; otherwise write straight to `docs/todo.md`. Either way, map the buckets onto the same two-bucket structure:

- Parity gaps -> punch-list under `# <reference> parity punch-list`, with one-line provenance (what was compared against what, date). Group by feature area; note cascade order.
- Improvements -> its own checkbox-spec section (e.g. `## Beyond <reference>`), placed after the parity tasks.
- If `docs/todo.md` already has content, append the new punch-list section to it. Never overwrite the file or delete existing tasks (same no-delete rule the `todo` skill applies to itself).

Task rules (per the `todo` skill if installed): each task independently executable, says what to change not where, sized to one commit. Out-of-scope tasks aren't written.

## Gotchas

- Rerunning against an existing `docs/todo.md`: append the new punch-list section, don't overwrite the file or delete prior tasks (Section 5).
- Reference identified but unreachable (private, no network, no read access) is a different blocker than the reference not being identified in the first place. Both stop at asking, never guess or substitute a stand-in (Section 1).

## Boundaries

- This skill owns analysis + the question gate; the `todo` skill (or plain `docs/todo.md`) owns the file format; your multi-task runner runs one task each.
- Plain note-dumps with no reference to catch up to -> go straight to `todo` (or `docs/todo.md` directly), skip this skill.
