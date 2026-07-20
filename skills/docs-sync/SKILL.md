---
name: docs-sync
description: "Reconciles `README`, `docs/*`, `CLAUDE.md`, and agent/skill/plugin prompt files with what the code actually does: fixes stale, missing, or overpromising claims and verifies every quoted command/flag/path. Use after a change alters documented behavior, when a tool's output shape or fields change, or to sweep all docs."
metadata:
  author: uwuclxdy
  version: "1.7"
---

# Docs Sync

Reconcile prose with code. Every claim in the docs must match what the code does today. Accuracy pass only; no restructuring.

**Delegate by default:** spawn the `docs-reconciler` agent (one per repo) and pass it the change description if the pass is scoped. Run inline only for a single small doc. If that agent def is missing in this environment, run the pass inline rather than blocking or trying to create it; the agent is an optional context-saver, not a prerequisite.

## Scope

- `README.md`, `docs/*.md`, `CLAUDE.md` / `AGENTS.md` (gitignored, still sync them).
- Agent-visible prompt files that enumerate a tool's surface: the `plugin/`, `commands/`, `agents/` dirs plus skill and agent prompt `.md`. A prompt that lists a tool's response fields or flags breaks silently when that surface changes, since the model keeps following it and reading fields that no longer exist. Sweep these on any output-shape or API change (field renames, dropped flags), alongside `README` and `docs`.
- Other repo-root docs (`CONTRIBUTING.md`, `SECURITY.md`, `.github/*.md`, etc.) are in scope only for the parts that make code-derived claims (build/test commands, flags, supported versions). Pure-policy prose with no code claim (`CODE_OF_CONDUCT.md`, license text, a security-reporting address) is out of scope, same reasoning as code comments below.
- Not in scope: code comments (including doc-comments like docstrings, JSDoc, rustdoc; those track code but are the code author's surface, not a doc file), CHANGELOG/release notes (a release-notes convention owns those), README section structure (a readme convention owns that).

## Procedure

1. **Explore code first, docs second.** Build the real feature/flag/command surface from source. For large repos, fan out subagents per subsystem and collect claims.
2. **Diff claims against reality.** For each doc statement, classify: accurate / stale / missing / overpromising.
3. **Fix:**
   - Stale → correct it to current behavior.
   - Missing feature → add the minimum line that covers it.
   - Overpromising (doc describes what code doesn't do) → delete or rewrite. Never leave aspirational claims; if it reads like a roadmap item, flag it to the user instead of silently keeping it.
4. **Verify the executable bits.** Every command, flag, env var, config key, and file path quoted in docs must exist. Run `--help` or grep the source rather than trusting the old text.
5. **Check paraphrases, not just quotes.** A README that paraphrases (rather than quotes) a changed description defeats text-grep. Diff the frontmatter/source text itself and check the paraphrase still covers what the new wording foregrounds.
6. **Pin dropped names so the sweep can't be forgotten.** Agent-visible strings compiled into source count too: retiring a tool or flag leaves them green and wrong. Pin the dropped names in a retired-names const with a test that scans every rendered string for them, so the check runs on its own instead of relying on memory.

## Style Rules

- **Edit and shorten over adding.** Collapse feature lists, merge near-duplicate sections, cut filler. Net diff should trend negative unless real features were missing.
- **Merging near-duplicates: diff each copy against the source, never against each other.** The authoritative-looking copy (a design doc, anything marked *locked*) drifts hardest, since nothing re-reads a settled doc against code, so deleting the scruffy duplicate promotes its wrong claims to sole truth. A doc's self-asserted verification (`e2e-verified`, `tested`, `both states compile`) is unfalsifiable prose: grep for the test before you trust it or delete it.
- Match the doc's existing voice and formatting; this is a sync, not a rewrite.
- Leave media placeholders alone (ASCII art, screenshots, gif slots); the user replaces those manually.
- Version numbers: only touch ones the code/Cargo.toml/pyproject contradicts.

## Output

Report a short reconciliation list, one bullet per fixed claim:

- `<file>`: said X, code does Y → <what changed>

Plus a separate **flagged** list for anything ambiguous (intentional roadmap? feature half-built?) that needs a user call.
