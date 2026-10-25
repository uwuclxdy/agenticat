---
description: Mines an external agent/skill collection and curates keepers into this repo's catalog (agents/, skills/, README links). Use when importing, adapting, or evaluating external agents, skills, or commands for agenticat.
argument-hint: "<owner/repo | git URL | local path> [focus, e.g. 'agents only']"
---

# Sync Agenticat

Harvest agents and skills from an external source, keep only what clears this repo's quality bar, rewrite to its conventions, route each keeper to its home, and **propose before writing**.

## Destinations

| Pick kind | Home | Rule |
|---|---|---|
| Agent worth shipping | `agents/<name>.md` | rewritten as a thin implementer, never copied verbatim |
| Knowledge worth a first-party skill | `skills/<name>/SKILL.md` | only as an original distillation authored here; declares `metadata.version` |
| Pristine third-party skill (no local edits) | README link | `npx skills add <owner>/<repo> --skill <name>` (drop `--skill` for single-skill repos) |
| Locally-edited third-party skill, catalog-worthy | `skills/<name>/` | vendored WITH its LICENSE + README credit + a "Modified:" note; permissive license required |
| Locally-edited third-party skill, not catalog-worthy | keep global-only | un-manage from npx (delete its `.skill-lock.json` entry) so a reinstall can't overwrite the edits |
| Curation-process rule or gotcha | this command's Pipeline | |
| Everything else | drop | listed in the drop list, not silently skipped |

Routing test: *does it act (method + gates + output contract)* → agent. *Is it knowledge an agent or session loads* → skill or README link, split by authorship. *Is it about how this repo curates* → this command's Pipeline.

License gate: a derived agent or first-party skill needs a permissive source license. A missing, all-rights-reserved, or unclear license routes the pick to a README link only (see Hard Rules).

## Pipeline

1. **Resolve the source** (`$1`): local path in place; `owner/repo` → github URL; git URL → shallow clone to a temp dir (remove at the end); raw URL → fetch. A trailing free-text arg (`agents only`, `just shell stuff`) narrows the harvest; honor it.

2. **Harvest.** Agent defs in any harness format (`agents/*.md`, `.claude/agents/`, opencode / codex / gemini dirs; same content is usually duplicated, read one canonical copy), skills (`SKILL.md`), commands. Prefer a reader that returns only the slices you ask for, if one is installed, so raw bytes stay out of the session. A def copied from another harness's folder can pass both the lint and the converter while its foreign keys are silently dropped: keep only claude frontmatter and relative paths.

3. **Read the destinations**: `agents/`, `skills/`, the README catalog tables and its External repos checked list, plus the maintainer's local `CLAUDE.md` and `docs/publish-backlog.md` where the checkout has them. A candidate overlapping an existing agent or skill extends it, never lands as a sibling. Before re-proposing something already rejected, check the External repos checked list and, where a local `CLAUDE.md` exists, its `## spec` non-goals.

4. **Cherry-pick + transform** each candidate:
   - **Thin-implementer rewrite.** Persona knowledge dumps (persona intro → arbitrary checklists → fabricated metrics → "integrates with" lists) get rewritten to method + quality gates + output contract; genuinely useful knowledge moves to a paired skill. Expect most persona catalogs to yield ~0 keepers. Before slimming or deleting a source in favor of its distilled skill, run a coverage digest with `tech-writer`'s digest mode.
   - **Currency-check** distilled tool claims against live docs: flags, config keys, CLI behavior. Upstream sources cite nonexistent flags; so do task prompts.
   - **Drop rot magnets**: scaffolding commands with pinned dep versions, install matrices, benchmarks, marketing.
   - **Scrub.** Prune upstream repo scaffolding (`.github/`, `CHANGELOG`, `CONTRIBUTING`); check `metadata.author` + license headers (a missing, all-rights-reserved, or restrictive license forces README-link-only, see Hard Rules); nothing personal or machine-specific lands in `agents/` or `skills/`. Promoting a live agent, read its whole body and genericize personal crate, convention and agent names and workspace-lint claims too, since `lint-agents.ts --portable` catches only `~/` and Linux home-directory paths; drop any self-maintained or run-appended section. A `docs/` path in a promoted file names the repo the agent runs in, never this repo's own `docs/`, which is not committed: grep the file for `docs/` before committing it (no lint checks this).
   - **Pairing check**, both directions: an agent touching a shipped skill's domain gets a conditional "load `<skill>` if installed" line with an inline fallback, never a hard dependency. A new skill sweeps existing agents for the reverse reference. The check tests that the two reference each other, never that they agree: where an agent and its skill both advise on the same act, read them side by side; the vendored skill is the likelier wrong half.
   - **Conventions**: frontmatter (`description`/`when_to_use` included), markers and headings per `CONTRIBUTING.md` (a fold from a live copy carries its substance only, never its heading case); set `model` only where task weight differs.

5. **Propose, then apply on approval**: a picks table (`# | artifact | home | work needed`), a drop list (one line each), caveats. Apply only after the user confirms.

6. **Land per artifact**: write the repo copy (a fix to a live copy lands here, never in the live copy), re-run the scrub (the machine-specific-reference and dash checks in `.github/workflows/lint-agents.yml`), sync README index tables + badge counts, run `bun bin/lint-agents.ts agents --portable`, verify the agent survives `bin/install-agents.ts` conversion (a new tool name or model alias may need the converter's map updated), run `bun test bin/` (a def that grants Bash without `Write`/`Edit` or `# sandbox:` needs its `DECLARED_CHECKS` row), commit `feat(agents|skills): add <name>`. Derived rewrites get a README credit line naming the upstream source. Push before refreshing any live install: each refresh reinstalls from the pushed remote and overwrites the live copy. After a push touching `skills/`, check that no installed file of the changed skill is newer than its `.skill-lock.json` `updatedAt` (a newer one holds a hand edit not yet folded into `skills/`: fold and push it first), then refresh it (`npx skills update <name> -g -y`); after one touching `agents/`, re-pin `agents@agenticat`, check its recorded `gitCommitSha`, and read the roster reminder a new session receives. Delete a promoted skill's global copy (or move it into `skills/`) in the same pass.

## Hard Rules

- **Vendor a third-party skill only once it's locally edited.** Pristine upstream stays a README link. A locally-edited upstream skill can't stay a live npx link (a reinstall drops the edits): vendor it into `skills/` if catalog-worthy (permissive license required: keep its LICENSE, add a README credit and a "Modified:" note), else keep it global-only and un-manage it from npx (delete its `.skill-lock.json` entry).
- **Source license gates derived work.** No LICENSE, all-rights-reserved, or an unclear or restrictive license: no derived agent or first-party skill rewrite from that source, only a README link (a link is not redistribution). Override only if the user explicitly accepts the risk.
- Derived work keeps attribution: README credit + license exception note when the license requires it.
- Report any secret read during the harvest, no matter why.
- Don't bump skill versions beyond the per-commit rule in `CONTRIBUTING.md`.
- Spot-verify any subagent-flagged keeper against the source file before believing it.
