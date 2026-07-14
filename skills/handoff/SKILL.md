---
name: handoff
description: "Capture the current session into a continuation prompt for a fresh one, or resume from a pasted handoff."
metadata:
  author: uwuclxdy
  version: "1.2"
---

# Handoff

Produce a continuation prompt for a fresh session or resume from one.

## Output Rules

- **Chat only.** Write the prompt in a single fenced codeblock so it copy-pastes clean. Skip files entirely; write one only if the user explicitly asks.
- **No length limit.** Capture everything load-bearing from this session, no matter how long the prompt runs; completeness over brevity, a dropped decision costs more than a long prompt does. Hand off decisions and state, not file contents. Secret values never go in; name where a credential lives instead.
- If the user gives next-step instructions when invoking the skill, they go into `next` verbatim. Exception: an instruction like "finish this then write a /handoff" means finish the requested work first; that instruction is already done by the time you write the prompt, so it doesn't go into `next`.
- Default: the new session starts in the same cwd and picks up the same static context (system prompt, CLAUDE.md) as this one, so don't restate that content. If the handoff may be resumed from a different cwd, use absolute paths throughout.
- Never assume the new session shares memory from this one. Skills you invoked, roles you took on, constraints you set: all of it needs restating or re-invoking. Tag files the new session should read at the start with `@file`.

## Continuation Prompt Template

```markdown
# /handoff <title>

> resume: read `load first`, verify `state` against the repo, treat `decisions` as settled, start at `next` 1. repo state beats this prompt on conflict.

## context
- repo/path: <abs path>, branch: <name>
- goal: <one line>
- load first: /<skill-name>, <@file references the session must read>

## state
- done + verified: <bullet per item, with how it was verified (test, build, manual)>
- committed: <last SHA + subject> / uncommitted: <git status summary, or "clean">

## decisions (do not re-litigate)
- <each decision the user made, verbatim where wording matters>
- <all user answers to questions asked this session>
- <decisions you made on your own>

## next
1. <first concrete action>
2. <remaining steps in order>

## gotchas
- <constraints, known traps, things that look wrong but are intentional>
```

Omit empty sections. Merge sections for tiny handoffs; the order stays. Add more sections in between if context needed for the next session doesn't fit in any of the above sections.

## Filling It Correctly

- **User answers are the highest-value content.** Copy every answer the user gave (question-tool picks or free text) into `decisions`, condensed but faithful.
- Base `state` on the injected git output below, not what you remember from earlier in the session.
- Anything not verified goes under `next` with a verify step.

## Resuming from a Handoff

When the user pastes a continuation prompt, read the referenced files and skills before acting, then follow the `> resume:` directive.

## Dynamic Context Injection

Commands run at skill invocation. This only executes under Claude Code; other harnesses render the `!` lines below as literal text, so run the commands manually there.

`git status --short`:
!`git status --short || true`

`git log --oneline -3`:
!`git log --oneline -3 || true`
