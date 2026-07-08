---
name: handoff
description: Continuation prompt handing work to a fresh session. Use for capturing the current session and continuing in a fresh one only from this handoff.
---

# handoff

Produce a continuation prompt for a fresh session or resume from one.

## Output rules

- **Chat only.** Write the prompt in a single fenced codeblock so it copy-pastes clean. No files unless user explicitly asks.
- **No length limit.** Capture everything important and load bearing from current session no matter how long the prompt gets; a dropped decision costs more than a long prompt. Still hand off *decisions and state*, not file contents; length comes from completeness, never padding.
- If the user gives next-step instructions when invoking the skill they go into `next` verbatim, except in cases like "finish this then write a /handoff".
- Absolute paths everywhere. The new session may start in a different cwd.
- Never assume the new session shares any memory generated in this session. Skills, roles, and constraints set this session must be restated or re-invoked. Tag files the new session should read at the start with `@file`.
- Assume the same working directory and starting conditions (context); do not restate what system prompts and CLAUDE.md files told you, the next session starts in the same cwd.

## Continuation prompt template

```markdown
# /handoff <title>

## context
- repo/path: <abs path>, branch: <name>
- goal: <one line>
- load first: </skill-name>, <@file references the session must read>

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

Omit empty sections. Merge sections for tiny handoffs; the order stays. Add more sections inbetween if context needed for the next session doesn't fit in any of the above sections. 

## Filling it correctly

- **User answers are the highest-value content.** Past sessions repeatedly lost them; copy every answer the user gave (question-tool picks or free text) into `decisions`, condensed but faithful.
- Run `git status --short` and `git log --oneline -3` before writing `state`. Report actual repo state, not remembered state.
- `done + verified` means verified. Anything not verified goes under `next` with a verify step.
- If the session used a skill, name it in `load first` if still relevant.

## Resuming from a handoff

When the user pastes a continuation prompt:

1. Read the referenced files and skills before acting.
2. Verify the `state` claims (build, git log).
3. Treat `decisions` as settled, do not re-ask.
4. Start at `next` step 1.

## Dynamic context injection

Commands run at skill invocation.

`git status --short`:
!`git status --short`

`git log --oneline -3`:
!`git log --oneline -3`
