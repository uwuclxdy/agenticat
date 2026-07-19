# Repo Modernization-Audit Prompt Template

Reusable spawn prompt for auditing one TUI repo against current ratatui. Spawn one
`general-purpose` subagent per repo (sonnet, unnamed, non-background, all repos in one message
for concurrency). Produced the 2026-07 punch-lists at `<repo>/docs/ratatui-modernization.md`.

Assumes a Claude-Code-style subagent runner (`general-purpose` subagent type, tool-call
spawning, no `SendMessage`). On another harness, substitute its own fan-out primitive, or run
the audit inline instead.

Fill `{{REPO}}`, `{{HINTS}}` (size, TUI dir, notable features), keep the rest verbatim:

```
You are a subagent: one of N parallel repo auditors checking our TUI codebases for ratatui
modernization opportunities. Your lane is ONLY the repo below; sibling agents own the others.

Target repo: {{REPO}} ({{HINTS}})

Mission: find every place this codebase hand-rolls something current ratatui already provides,
plus legacy-idiom usage, so a later session can modernize it.

CRITICAL: your training predates ratatui 0.29/0.30. Do NOT trust your memory of the ratatui
API. The authoritative reference is references/api-reference.md.
Before auditing, read its table of contents, the version-specific-notes section, and the
cheat-sheet section at the end; also read
references/modernization-checklist.md, your checklist.
Consult other reference sections as needed; they are generated from ratatui source and outrank
anything you remember.

Method:
1. Locate TUI code: grep `use ratatui`/`use crossterm` to map modules. Read terminal
   setup/teardown, event loop, layout code, custom widgets, styling helpers, TUI tests.
2. Flag every hand-rolled reimplementation from the checklist (tier 1 + tier 2 + hunt patterns).
3. Flag Cargo.toml issues: stale version pin, `default-features = false` dropping
   `layout-cache`, unused features (`macros`, `all-widgets`).
4. Note what is ALREADY modern / done well.
5. Test audit: TestBackend? assert_buffer_lines? What is testable but untested (name concrete
   render fns)? Check the smells in references/testing.md.
6. Classify every custom-rendered widget/effect as REPLACEABLE (name the built-in) or
   BEYOND-API (cross-check references/limitations.md; say what minimal custom layer it needs).

Deliverables:
A. Write the full punch-list to {{REPO}}/docs/ratatui-modernization.md (create docs/ if
   missing). Lowercase prose, findings table:
   `# | file:line | hand-rolled | replacement | effort (S/M/L) | risk`,
   then sections: done well, test status, beyond-api customs. This is the ONLY file you may
   create or modify. Never touch source, never run mutating cargo commands, never git.
B. Your final message IS your report (no SendMessage; tool names are tool calls, never shell
   commands). Return: the punch-list table verbatim (top 15 rows max, note the rest live in
   the file), the done-well list, a one-line test status, the beyond-api list. Never return
   counts in place of the table.

Failure behavior: if the repo path or a reference file is missing/unreadable, report exactly
which input failed and stop. Never widen scope or substitute a target.
```

For a design-system/widget-library repo, add: a limitations analysis classifying every
design-language feature as REPLACEABLE / PARTIAL / BEYOND-API with the reason, returned as a
full table (feeds `limitations.md`).
