---
name: handoff
description: "Captures the current session into a continuation prompt for a fresh one, or resumes from a pasted handoff. Use when context is running low, when ending a session mid-task, or when told to 'hand off' or write a handoff. `/handoff reusable` instead maintains a persistent multi-session task-runner state file (`docs/handoff-state.md`) that a fresh session reads, advances a few tasks via agent pairs, and re-saves."
metadata:
  author: uwuclxdy
  version: "1.7"
---

# Handoff

Produce a continuation prompt for a fresh session or resume from one.

## Output Rules

- **Chat only (default mode).** Write the prompt in a single fenced codeblock so it copy-pastes clean. Skip files entirely; write one only if the user explicitly asks. The Reusable Mode below is the sole file-writing exception.
- **No length limit.** Capture everything load-bearing from this session, no matter how long the prompt runs; completeness over brevity, a dropped decision costs more than a long prompt does. Hand off decisions and state, not file contents. Secret values never go in; name where a credential lives instead.
- If the user gives next-step instructions when invoking the skill, they go into `next` verbatim. Exception: an instruction like "finish this then write a /handoff" means finish the requested work first; that instruction is already done by the time you write the prompt, so it doesn't go into `next`.
- Default: the new session starts in the same cwd and picks up the same static context (system prompt, CLAUDE.md) as this one, so don't restate that content. If the handoff may be resumed from a different cwd, use absolute paths throughout.
- Never assume the new session shares memory from this one. Skills you invoked, roles you took on, constraints you set: all of it needs restating or re-invoking. Tag files the new session should read at the start with `@file`.
- **No git repo:** if the injected `git status`/`git log` output is empty (cwd isn't a repo), write branch, SHA, and status fields as `N/A (no git repo)` instead of guessing a branch name or SHA.

## Continuation Prompt Template

```markdown
# /handoff <title>

> resume: read `load first`, verify `state` against the repo, treat `decisions` as settled, start at `next` 1. repo state beats this prompt on conflict.

## context
- repo/path: <abs path>, branch: <name, or "N/A (no git repo)">
- goal: <one line>
- load first: /<skill-name>, <@file references the session must read>

## state
- done + verified: <bullet per item, with how it was verified (test, build, manual)>
- committed: <last SHA + subject, or "N/A (no git repo)"> / uncommitted: <git status summary, "clean", or "N/A (no git repo)">

## decisions (do not re-litigate)
- <each decision the user made, verbatim where wording matters>
- <all user answers to questions asked this session>
- <decisions you made on your own>

## next
1. <first concrete action>
2. <remaining steps in order>

## gotchas
- <constraints, known traps, things that look wrong but are intentional>
- <harness traps that produced false results this session (false GREEN/RED shapes), so the next session doesn't re-earn them>
```

For an INVESTIGATION handoff (root-causing, not building), add a hypothesis ledger between
`state` and `next`; this structure is the highest-value thing an investigation session can
pass on:

```markdown
## hypotheses to test (NOT established: the next session's job)
- **H1: <claim>.** decomposed: mechanism / trigger / attribution (these live and die
  separately). evidence for, evidence against, and the KILL CRITERION: the concrete result
  that proves it dead ("if all versions are RED, H1-attribution is dead; say so and pivot").
- <mark which prior verdicts are inherited and must be re-verified rather than trusted;
  flag any authoritative-looking doc whose claims the next session should check against
  primary sources>
```

Omit empty sections. Merge sections for tiny handoffs; the order stays. Add more sections in between if context needed for the next session doesn't fit in any of the above sections.

## Filling It Correctly

- **User answers are the highest-value content.** Copy every answer the user gave (question-tool picks or free text) into `decisions`, condensed but faithful.
- Base `state` on the injected git output below, not what you remember from earlier in the session.
- Anything not verified goes under `next` with a verify step.
- **Inline what dies with this session; hand off re-derivable state as commands rather than pasted output.** A fresh session auto-loads the system prompt plus CLAUDE.md and can re-run any diff, grep, git, or tool call cheaply, so point at those. A short "must re-derive" list keeps stated-only facts distinct from regenerable ones. Anything that lived only in this session's context and is unreachable later must be copied in verbatim. The sharpest case is a subagent's findings: its transcript is this session's scratchpad, a resumer cannot open it, so any judgment it produced (which files diverged, what is load-bearing, per-item verdicts) reaches the next session only if you inline it. A conclusion without the judgment behind it forces a re-run that may not reproduce.
- **Supersede decisions in place; never append.** If a decision changed mid-session, rewrite the `decisions` block to the final state. The resume directive says treat decisions as settled, so a stale one left standing makes the resumer re-apply the old plan. When you revise a handoff, mark it "supersedes any earlier version of itself".
- **Tag steps by edit surface** when the plan touches more than one (repo vs a global or home config, code vs infra), so the resumer knows where each action lands.

## Resuming from a Handoff

When the user pastes a continuation prompt, read the referenced files and skills before acting, then follow the `> resume:` directive.

## Reusable Mode (`/handoff reusable`)

For burning a task backlog down over many sessions: maintain a persistent task-runner state file the next session reads, advances a few tasks, and re-saves, instead of a one-shot chat prompt. The default chat-only mode above applies whenever `reusable` is absent.

**Dispatch on the trigger, not on file existence alone.** Three distinct triggers:
1. `/handoff reusable` **with no state file** → CREATE it (schema below).
2. **a pasted continuation prompt** → RUN the runner protocol from step 1, then save. This is the resume path; it does work.
3. `/handoff reusable` mid-session **with the file already present** → SAVE-POINT only: run protocol step 7 (save), run no tasks.

`/handoff reusable <N>` sets tasks-per-session (default 3); an explicit `<N>` updates both the file's protocol and its embedded prompt.

**State file** = `docs/handoff-state.md` in the repo (gitignored, cross-session memory, not committed). Outside a repo or with no `docs/`, ask where it should live.

**CREATE writes these sections:**
- **context**: repo path + branch, one-line goal, `load first` skills / `@files`.
- **state**: done + verified so far (empty at first), last commit + uncommitted summary.
- **decisions**: every settled call (user answers verbatim where wording matters) so no task carries a parked question.
- **task queue**: every task that can start now, priority-ordered, each self-contained in the `todo` skill's shape (current → required + how + verify, no `file:line`), one clean commit each, marked `☐`. Blocked / gated / upstream items never enter the queue; they stay in `docs/todo.md`, referenced, never started.
- **embedded prompt**: the continuation prompt below, VERBATIM (so the loop survives lost scrollback), with a line stating the file wins over the prompt on any conflict.
- **runner protocol**: the loop block below, baked in so the file drives itself.
- **progress log**: empty, append-only.
- **gotchas**: the repo's gate/build/verify traps + any false GREEN/RED shapes hit this session.

**Status markers:** `☐` pending · `☑` done · `☒` blocked (found unstartable at run time, moved to `docs/todo.md` with the reason and evicted from the active queue).

**Continuation prompt** is SHORT, STABLE, and stored in the file so it can be re-emitted verbatim every session. Substitute `<name>` and `<N>` once when the file is created, never after:

```
/handoff reusable: resume <name> queue. read @docs/handoff-state.md and run its runner protocol
from step 1 (a resume DOES tasks, it is not a save-point). the file wins over this prompt on any
conflict. blocked items stay in @docs/todo.md, do not start them.
```

**Runner protocol** (baked into the state file; a resume executes it):
1. read the whole file; reconcile `state` against `git status`/`git log` before trusting it.
2. take the next `<N>` tasks still `☐` in queue order (fewer if fewer remain, or if context is tight). Never start one you cannot finish AND verify this session.
3. run each task:
   - code task → an impl+reviewer agent pair iterating until the reviewer is clean.
   - single-hunk doc-only edit → inline, still verified.
   - disjoint-file tasks may parallelize, each impl agent in its own `git worktree add`.
4. verify with the repo's real gate (its build/test/lint entrypoint), never a weaker check.
5. commit per the repo's rules (code and docs in separate commits).
6. resolve the task:
   - success → mark `☑` in place with one-line evidence (test name + sha); append a progress-log line.
   - blocker surfaces mid-task → move it to `docs/todo.md` with the reason, mark `☒`, append a progress-log line, continue with the next `☐`.
   - ~3 red impl↔review or gate iterations with no progress → stop that task, record its partial state in its `current` field, leave it `☐`, and escalate rather than keep patching.
7. save the file: supersede task status AND `decisions` in place (never append a duplicate block), append new `gotchas` + progress-log lines, refresh `state`, route any newly surfaced work (queue tail or `docs/todo.md`). Re-emit the embedded prompt verbatim.
8. STOP after the batch or when context runs low. An interrupted task stays `☐` with its partial state in `current`.
9. when every task is `☑` or `☒`: propagate anything session-only into a test or the owning doc, then delete the state file and report the queue done.

## Dynamic Context Injection

Commands run at skill invocation. This only executes under Claude Code; other harnesses render the `!` lines below as literal text, so run the commands manually there.

`git status --short`:
!`git status --short || true`

`git log --oneline -3`:
!`git log --oneline -3 || true`

Outside a git repo both commands return nothing (the `|| true` swallows the error). Empty output means the cwd isn't a git repo, it doesn't mean "clean". Fill branch/SHA/status fields as `N/A (no git repo)`.
