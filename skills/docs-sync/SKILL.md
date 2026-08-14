---
name: docs-sync
description: "Reconciles `README`, `docs/*`, `CLAUDE.md`, and agent/skill/plugin prompt files with what the code does: stale, missing, or overpromising claims; verifies quoted commands/flags/paths. Use when a change alters documented behavior, a tool's output shape changes, or to sweep all docs."
metadata:
  author: uwuclxdy
  version: "1.10"
---

# Docs Sync

Reconcile prose with code. Every claim in the docs must match what the code does today. Accuracy pass only; no restructuring.

**Delegate by default:** spawn the `docs-reconciler` agent (one per repo) and pass it the change description if the pass is scoped. Run inline only for a single small doc. If that agent def is missing in this environment, run the pass inline rather than blocking or trying to create it; the agent is an optional context-saver, not a prerequisite.

## Scope

- `README.md`, `wiki/`, `docs/*.md`, `CLAUDE.md` / `AGENTS.md` (gitignored, still sync them). `wiki/` + `README.md` are the default committed, user-facing docs.
- Agent-visible prompt files that enumerate a tool's surface: the `plugin/`, `commands/`, `agents/` dirs plus skill and agent prompt `.md`. A prompt that lists a tool's response fields or flags breaks silently when that surface changes, since the model keeps following it and reading fields that no longer exist. Sweep these on any output-shape or API change (field renames, dropped flags), alongside `README` and `docs`.
- Other repo-root docs (`CONTRIBUTING.md`, `SECURITY.md`, `.github/*.md`, etc.) are in scope only for the parts that make code-derived claims (build/test commands, flags, supported versions). Pure-policy prose with no code claim (`CODE_OF_CONDUCT.md`, license text, a security-reporting address) is out of scope, same reasoning as code comments below.
- Not in scope: code comments (including doc-comments like docstrings, JSDoc, rustdoc; those track code but are the code author's surface, not a doc file), CHANGELOG/release notes (a release-notes convention owns those), README section structure (a readme convention owns that), and bare copyedits (a typo or wording fix carrying no code-derived claim needs a plain edit, not a reconciliation pass).

## Procedure

**Never run this from a worktree.** `git worktree add` checks out tracked files only; gitignored `docs/`, `CLAUDE.md`, `.claude/` exist in the main checkout alone, so a pass spawned into a worktree finds nothing to reconcile and reports a false clean. Run from the main checkout.

1. **Explore code first, docs second.** Build the real feature/flag/command surface from source. For large repos, fan out subagents per subsystem and collect claims.
2. **Diff claims against reality.** For each doc statement, classify: accurate / stale / missing / overpromising.
3. **Fix:**
   - Stale → correct it to current behavior.
   - Missing feature → add the minimum line that covers it.
   - Overpromising (doc describes what code doesn't do) → delete or rewrite. Never leave aspirational claims; if it reads like a roadmap item, flag it to the user instead of silently keeping it.
4. **Verify the executable bits.** Every command, flag, env var, config key, and file path quoted in docs must exist. Run `--help` or grep the source rather than trusting the old text.
5. **Check paraphrases, not just quotes.** A README that paraphrases (rather than quotes) a changed description defeats text-grep. Diff the frontmatter/source text itself and check the paraphrase still covers what the new wording foregrounds.
6. **Pin dropped names so the sweep can't be forgotten.** Agent-visible strings compiled into source count too: retiring a tool or flag leaves them green and wrong. Pin the dropped names in a retired-names const with a test that scans every rendered string for them, so the check runs on its own instead of relying on memory.
7. **Reconcile before the change counts as done, not after.** Never leave the reconciliation diff uncommitted, and never ship a code commit without a matching docs commit. `wiki/`/`README` updates land as a follow-up `docs:` commit.

## Style Rules

- **Edit and shorten over adding.** Collapse feature lists, merge near-duplicate sections, cut filler. Net diff should trend negative unless real features were missing.
- **A deletion sweep needs a repo-wide reference grep first.** Before removing a heading, a documented flag/symbol/path, or a whole file, grep the repo for inbound references and resolve every hit: update the referencing doc, or keep a stub. Never leave a dangling pointer.
- **Merging near-duplicates: diff each copy against the source, never against each other.** The authoritative-looking copy (a design doc, anything marked *locked*) drifts hardest, since nothing re-reads a settled doc against code, so deleting the scruffy duplicate promotes its wrong claims to sole truth. A doc's self-asserted verification (`e2e-verified`, `tested`, `both states compile`) is unfalsifiable prose: grep for the test before you trust it or delete it.
- Match the doc's existing voice and formatting; this is a sync, not a rewrite.
- Leave media placeholders alone (ASCII art, screenshots, gif slots); the user replaces those manually.
- Version numbers: only touch ones the code/Cargo.toml/pyproject contradicts.
- **A minimum-version claim belongs to the API surface it was measured on.** Upstream states a floor per surface. A program calling a second, newer surface inherits the newer floor, and the old number keeps reading as verified in every doc that copied it. Check which surface upstream attaches the number to, then check every surface the code calls. Where upstream states no floor for one of them, name the source of whatever number you ship.
- **A durable doc names its artifact, never points at one.** "the old X", `HEAD~3`, "the previous wording" rot the moment anything lands after them. Quote the literal string, or pin an immutable ref (sha/tag) that still resolves in a year.
- **A dated record reconciles against its own date, never today's code.** Release notes and applied audit rows describe a past state. Rewriting one to match current code destroys the record; every check still reads green. Before touching a citation inside a dated artifact, `git show <sha>:<path>` as of the date it claims. Leave it standing if it was true then, and note separately that the file is since gone.
- `docs/todo.md` carries OPEN work only. A landed item gets propagated into its owning test or doc, then deleted. Never restated as a shipped record.

## Output

Report a short reconciliation list, one bullet per fixed claim:

- `<file>`: said X, code does Y → <what changed>

Plus a separate **flagged** list for anything ambiguous (intentional roadmap? feature half-built?) that needs a user call.
