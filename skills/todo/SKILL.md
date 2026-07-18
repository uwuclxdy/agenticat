---
name: todo
description: "Author and normalize tasks into `docs/todo.md`. Use when writing a todo list, capturing audit findings, or turning loose notes into pickup-cold-ready tasks."
metadata:
  author: uwuclxdy
  version: "1.3"
---

# Todo

`docs/todo.md` is the per-repo task inbox.

## Core Rule

**Every task must be executable by a fresh agent with no session context.** Self-contained: current behavior, expected behavior, and a verify step. If a task needs a decision the user hasn't made, AskUserQuestion before writing it down (`AskUserQuestion` is Claude Code's question tool; other harnesses ship their own native tool: opencode's `question`, gemini-cli's `ask_user`, Codex CLI's `request_user_input`. Use it if present, else fall back to a plain numbered message). Never park open questions inside a task.

Tasks say what needs to change and, sometimes, how. Never where. No `file:line`, no file paths. The executing agent locates the code itself since locations rot faster than intent.

**Size tasks by scope.** Combine small related nits into one task; split anything too big for a single reviewable change into independent tasks. The unit is "one agent, one clean commit".

## Two Formats, Picked by Source

### Audit Findings / Bugs -> Punch-List

For audit results, contract violations, bug reports:

```markdown
# <audit name> punch-list

<one-line provenance: what was audited against what, date>

## <component / feature area>

- [ ] <current behavior> -> <required behavior>. <optional how. ordering note if other items cascade from it>
```

- Group by component or feature area, not by severity.
- Note cascade order explicitly ("fix first: X findings depend on it").

### Feature Ideas / Specs -> Checkbox Spec

For new features, enhancements, raw idea notes:

```markdown
## <N>. <feature title>

<one-line intent if the title doesn't carry it>

### <surface: Backend / Frontend / TUI / CLI / Schema>
- [ ] <concrete, verifiable step>
```

- Number tasks; subsection per surface touched; one reviewable change per checkbox.

## Normalizing Raw Notes

When the user dumps loose notes ("inconsistent cursor..", "remove j/k"):

1. Read the relevant code first. Resolve each note to specific files and current behavior.
2. Ask clarifying questions for anything ambiguous (batch them, don't trickle).
3. Rewrite as tasks in the matching format above. The original note text can be dropped once the task captures it fully.

## Resolving

- Never delete a task, unresolved or completed, without the user saying so. Leave completed checkboxes checked in place as a record.
- When asked to "resolve the todo", route execution through your multi-task runner or workflows (one task each); this skill only owns the file.
