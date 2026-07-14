---
name: sync-agenticat
description: Mine an external agent/skill collection and curate keepers into this repo's catalog (agents/, skills/, README links). Use when importing, adapting, or evaluating external agents, skills, or commands for agenticat.
argument-hint: "<owner/repo | git URL | local path> [focus, e.g. 'agents only']"
---

# Sync Agenticat

Harvest agents and skills from an external source, keep only what clears this repo's
quality bar, rewrite to its conventions, route each keeper to its home, and
**propose before writing**.

## Destinations

| Pick kind | Home | Rule |
|---|---|---|
| Agent worth shipping | `agents/<name>.md` | rewritten as a thin implementer, never copied verbatim |
| Knowledge worth a first-party skill | `skills/<name>/SKILL.md` | only as an original distillation authored here; declares `metadata.version` |
| Good third-party skill as-is | README link | `npx skills add <owner>/<repo> --skill <name>` (drop `--skill` for single-skill repos); **never vendored** |
| Curation-process rule or gotcha | `CLAUDE.md` learnings / `docs/publish-backlog.md` | |
| Everything else | drop | listed in the drop list, not silently skipped |

Routing test: *does it act (method + gates + output contract)* → agent. *Is it knowledge an
agent or session loads* → skill or README link, split by authorship. *Is it about how this
repo curates* → learnings.

## Pipeline

1. **Resolve the source** (`$1`): local path in place; `owner/repo` → github URL; git URL →
   shallow clone to a temp dir (remove at the end); raw URL → fetch. A trailing free-text arg
   (`agents only`, `just shell stuff`) narrows the harvest — honor it.

2. **Harvest.** Agent defs in any harness format (`agents/*.md`, `.claude/agents/`, opencode /
   codex / gemini dirs — same content is usually duplicated, read one canonical copy), skills
   (`SKILL.md`), commands. Prefer context-mode reading (batch + search) so raw bytes stay out
   of the session.

3. **Read the destinations**: `agents/`, `skills/`, the README catalog tables, `CLAUDE.md`,
   `docs/publish-backlog.md`. A candidate overlapping an existing agent or skill extends it —
   never lands as a sibling. Check the backlog's held list before re-proposing something
   already rejected.

4. **Cherry-pick + transform** each candidate:
   - **Thin-implementer rewrite.** Persona knowledge dumps (persona intro → arbitrary
     checklists → fabricated metrics → "integrates with" lists) get rewritten to method +
     quality gates + output contract; genuinely useful knowledge moves to a paired skill.
     Expect most persona catalogs to yield ~0 keepers.
   - **Currency-check** distilled tool claims against live docs — flags, config keys, CLI
     behavior. Upstream sources cite nonexistent flags; so do task prompts.
   - **Drop rot magnets**: scaffolding commands with pinned dep versions, install matrices,
     benchmarks, marketing.
   - **Scrub.** Prune upstream repo scaffolding (`.github/`, `CHANGELOG`, `CONTRIBUTING`); check
     `metadata.author` + license headers; nothing personal or machine-specific lands in
     `agents/` or `skills/`.
   - **Pairing check**, both directions: an agent touching a shipped skill's domain gets a
     conditional "load `<skill>` if installed" line with an inline fallback — never a hard
     dependency. A new skill sweeps existing agents for the reverse reference.
   - **Conventions**: lowercase frontmatter `name`/`description` (third-person, trigger-rich),
     Title Case headings, comma-string `tools`, `model` picked per task weight (sonnet default
     for implementers).

5. **Propose, then apply on approval**: a picks table (`# | artifact | home | work needed`),
   a drop list (one line each), caveats. Apply only after the user confirms.

6. **Land per artifact**: write the repo copy, re-run the scrub
   (`grep -rE '/home/|192\.168|cloudify|cloudy-' agents/ skills/`), sync README index tables +
   badge counts + `CLAUDE.md` counts, verify the agent survives `bin/install-agents.ts`
   conversion (a new tool name or model alias may need the converter's map updated — see
   `docs/frontmatter-sync-plan.md`), commit `feat(agents|skills): add <name>`. Derived
   rewrites get a README credit line naming the upstream source.

## Hard Rules

- **Never vendor a third-party skill** — README link only, regardless of license.
- Derived work keeps attribution: README credit + license exception note when the license
  requires it.
- Report any secret read during the harvest, no matter why.
- Don't bump skill versions beyond the per-commit rule in `CLAUDE.md`.
- Spot-verify any subagent-flagged keeper against the source file before believing it.
