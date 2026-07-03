---
name: handoff
description: Write a continuation prompt handing work to a fresh session, or resume from one. Use when the user says handoff / continue this elsewhere / wrap up for a new session, when context is close to compaction with work unfinished, or when a continuation prompt gets pasted in.
---

# handoff

Produce a continuation prompt for a fresh session, or resume from one.

## Output rules

- **Chat only.** Print the prompt in a single fenced codeblock so it copy-pastes clean. No files unless the user explicitly asks for one.
- **No length limit.** Capture everything important from the session no matter how long the prompt gets — a dropped decision costs more than a long prompt. Still hand off *decisions and state*, not file contents; length comes from completeness, never padding.
- If the user gives next-step instructions when invoking the skill, they go into `next` verbatim and ahead of anything inferred from the session.
- Absolute paths everywhere. The new session may start in a different cwd.
- Never assume the new session shares any memory. Skills, roles, and constraints set this session must be restated or re-invoked.

## Continuation prompt template

```markdown
# <project> — continuation

## context
- repo/path: <abs path>, branch: <name>
- goal: <one line>
- load first: </skill-name>, <@file references the session must read>

## state
- done + verified: <bullet per item, with how it was verified (test, build, manual)>
- committed: <last SHA + subject> / uncommitted: <git status summary, or "clean">

## decisions (do not re-litigate)
- <each decision the user made, verbatim where wording matters>
- <user answers to questions asked this session — include all of them>

## next
1. <first concrete action, with exact command if any (e.g. `cargo test`)>
2. <remaining steps in order>

## gotchas
- <constraints, known traps, things that look wrong but are intentional>
```

Omit empty sections. Merge sections for tiny handoffs; the order stays.

## Filling it correctly

- **User answers are the highest-value content.** Past sessions repeatedly lost them; copy every answer the user gave (question-tool picks or free text) into `decisions`, condensed but faithful.
- Run `git status --short` and `git log --oneline -3` before writing `state` — report actual repo state, not remembered state.
- `done + verified` means verified. Anything not verified goes under `next` with a verify step.
- If the session used a skill, name it in `load first` so the next session loads it before acting.

## Resuming from a handoff

When the user pastes a continuation prompt:

1. Read the referenced files and skills before acting.
2. Verify the `state` claims (build, git log) instead of trusting them; flag mismatches.
3. Treat `decisions` as settled — do not re-ask.
4. Start at `next` step 1.
