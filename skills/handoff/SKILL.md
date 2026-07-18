---
name: handoff
description: "Capture the current session into a continuation prompt for a fresh one, or resume from a pasted handoff. Use when context is running low, when ending a session mid-task, or when told to 'hand off' or write a handoff."
metadata:
  author: uwuclxdy
  version: "1.4"
---

# Handoff

Produce a continuation prompt for a fresh session or resume from one.

## Output Rules

- **Chat only.** Write the prompt in a single fenced codeblock so it copy-pastes clean. Skip files entirely; write one only if the user explicitly asks.
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
`state` and `next` — this structure is the highest-value thing an investigation session can
pass on:

```markdown
## hypotheses to test (NOT established — the next session's job)
- **H1 — <claim>.** decomposed: mechanism / trigger / attribution (these live and die
  separately). evidence for, evidence against, and the KILL CRITERION: the concrete result
  that proves it dead ("if all versions are RED, H1-attribution is dead — say so and pivot").
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

## Dynamic Context Injection

Commands run at skill invocation. This only executes under Claude Code; other harnesses render the `!` lines below as literal text, so run the commands manually there.

`git status --short`:
!`git status --short || true`

`git log --oneline -3`:
!`git log --oneline -3 || true`

Outside a git repo both commands return nothing (the `|| true` swallows the error). Empty output means the cwd isn't a git repo, it doesn't mean "clean". Fill branch/SHA/status fields as `N/A (no git repo)`.
