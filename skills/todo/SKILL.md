---
name: todo
description: Author and normalize tasks in a repo's docs/todo.md — punch-lists from audit findings, checkbox specs from feature ideas, cleanup of raw user notes. Use when the user wants something added to the todo, dumps loose notes to capture, or asks to mark tasks resolved.
---

# todo

`docs/todo.md` is the per-repo task inbox. This skill defines how tasks get written into it, normalized, and marked resolved.

## Core rule

**Every task must be executable by a fresh agent with no session context.** Self-contained: current behavior, expected behavior, and a verify step. If a task needs a decision the user hasn't made, ask before writing it down — never park open questions inside a task.

Tasks state **what** needs to change and optionally **how** — never **where**. No `file:line`, no file paths; the executing agent locates the code itself, and locations rot faster than intent.

**Size tasks by scope.** Combine small related nits into one task; split anything too big for a single reviewable change into independent tasks. The unit is "one agent, one clean commit".

## Two formats, picked by source

### Audit findings / bugs → punch-list

For audit results, contract violations, bug reports:

```markdown
# <audit name> punch-list

<one-line provenance: what was audited against what, date>

## <component / feature area>

- [ ] <current behavior> → <required behavior>. <optional how. ordering note if other items cascade from it>
```

- Group by component or feature area, not by severity.
- Note cascade order explicitly ("fix first — X findings depend on it").

### Feature ideas / specs → checkbox spec

For new features, enhancements, raw idea notes:

```markdown
## <N>. <feature title>

<one-line intent if the title doesn't carry it>

### <surface: Backend / Frontend / TUI / CLI / Schema>
- [ ] <concrete, verifiable step>
```

- Number tasks; subsection per surface touched.
- Each checkbox is one reviewable change, not "implement the feature".

## Normalizing raw notes

When the user dumps loose notes ("inconsistent cursor..", "remove j/k"):

1. Read the relevant code first — resolve each note to files and current behavior.
2. Ask clarifying questions for anything ambiguous (batch them, don't trickle).
3. Rewrite as tasks in the matching format above. The original note text can be dropped once the task captures it fully.

## Resolution bookkeeping

- When `docs/` is gitignored (common for internal notes), resolved history lives **in the file**, not git.
- On resolve: check the box or move the task under a `## Resolved` section with commit SHA + date + one line on what landed.
- Never delete unresolved tasks without the user saying so.
- When asked to "resolve the todo", route execution through your multi-task runner or workflows (one task each); this skill only owns the file.
