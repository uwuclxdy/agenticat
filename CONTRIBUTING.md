# Contributing

Welcome contributions: new agents, new skills, fixes to existing ones, and README links to good third-party skills.

## Ground rules

- **Claude Code format is canonical.** `agents/*.md` and `skills/<name>/SKILL.md` are the source of truth; opencode/codex output derives from them at install time via `bin/install-agents.ts`. Don't PR generated files.
- **Don't PR a vendored third-party skill.** If a skill you didn't write is worth sharing, PR a row in the README's external skills table instead. It installs from its own repo with `npx skills add <owner>/<repo> --skill <name>`. A few are vendored here (`webapp-testing`, Apache-2.0), each with its LICENSE and a modification note; that call stays with the maintainer.
- **Nothing personal or machine-specific**: absolute paths, IPs, hostnames, private tooling. `git grep -nE '/hom[e]/|192[.]168[.]|cloudif[y]|cloudy[-]|/User[s]/|/mn[t]/'` must come back clean; run it after `git add` so new files are scanned. This is the same scan the CI gate runs.

## Agents

An agent def is a thin implementer: a method, quality gates, and an output contract. Persona intros, invented delivery metrics, and "integrates with" lists don't land.

- Frontmatter: `name`, `description`, optionally `model` (`haiku`/`sonnet`/`opus` alias; omit it to inherit the caller's model, the default for language implementers), and optionally `disallowedTools` or `tools` (comma-separated strings). Omit both to inherit every tool; that's the implementer default. Frontmatter values stay lowercase; body headings use Title Case (`## Method`).
- **Mark a never-mutating def `# lint: read-only`.** A def that must never mutate the tree carries `# lint: read-only` in its frontmatter and a top-level `- **Read-only.**` hard-rule bullet (0-3 columns of indent; a deeper, fenced or commented-out copy does not count); the lint then refuses any `Edit`, `Write`, `NotebookEdit`, `Agent` or `Task` grant, and treats a missing bullet or a denylist without all five as an error. Write each directive line in lower case: `# lint:` plus the directives, separated by commas or spaces, with any extra prose after the first full stop. Several `# lint:` lines merge. An unknown directive or a near-miss spelling like `# Lint:` is an error.
- **Prefer `disallowedTools`.** `tools` is an exact allowlist: it drops every MCP tool and `ToolSearch` along with everything else unnamed, so an agent that carries one can't reach any MCP server no matter what the user has installed. A denylist keeps the read-only contract without that blast radius. Setting both is a silent bug, Claude Code ignores `disallowedTools` whenever `tools` is present. Use `tools` only when the tight sandbox is the point, and mark it `# lint: sandboxed`.
- Write the `description` in third person for triggering: what it does, what it returns, how to spawn it ("Spawn one per …"), and a " - Use when" clause listing the concrete trigger situations.
- Domain knowledge belongs in a paired skill, referenced conditionally ("load `<skill>` if installed") with an inline fallback checklist. Installs are cherry-picked, so an agent can't assume a sibling skill ships.

## Skills

- One directory under `skills/<name>/` with a `SKILL.md`; extra reference files next to it are fine.
- `description` is third person with concrete trigger phrases, the kind of words a user actually types.
- Declare `metadata.version` and bump it in the same commit as any edit to the skill.
- Verify every tool claim (flags, config keys, CLI behavior) against current docs before distilling it. Upstream sources cite flags that don't exist.
- No scaffolding templates with pinned dependency versions; they rot.

## Before you PR

- [ ] `bun bin/lint-agents.ts agents --portable` passes (CI runs it too; an agent `name` is lowercase letters, digits and hyphens, starts with a letter or digit, and matches its file name)
- [ ] `bun test bin/` passes when you touch `bin/`
- [ ] a renamed agent, or one folded into another, gets a row in `RENAMES` in `bin/install-agents.ts` pointing at its successor, and any older row pointing at the old name is re-pointed to the new one, so `./install.sh --update` carries existing installs over
- [ ] scrub grep (above) comes back clean
- [ ] README catalog tables and badge counts match the contents of `agents/` and `skills/`
- [ ] a new agent shows up in `./install.sh --list` and its converted opencode/codex output looks sane
- [ ] a new agent or skill checked the other side for a pairing reference
- [ ] commits follow conventional commits, e.g. `feat(agents): add <name>`

## License

MIT. By contributing you agree your contribution ships under it. Work derived from another project keeps a credit line in the README.
