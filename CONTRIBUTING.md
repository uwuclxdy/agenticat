# Contributing

Welcome contributions: new agents, new skills, fixes to existing ones, and README links to good third-party skills.

## Ground rules

- **Claude Code format is canonical.** `agents/*.md` and `skills/<name>/SKILL.md` are the source of truth; opencode/codex output derives from them at install time via `bin/install-agents.ts`. Don't PR generated files.
- **Third-party skills are never vendored.** If a skill you didn't write is worth sharing, PR a row in the README's external skills table instead. It installs from its own repo with `npx skills add <owner>/<repo> --skill <name>`.
- **Nothing personal or machine-specific**: absolute paths, IPs, hostnames, private tooling. `grep -rE '/home/|192\.168\.|cloudify|cloudy-' agents/ skills/` must come back clean.

## Agents

An agent def is a thin implementer: a method, quality gates, and an output contract. Persona intros, invented delivery metrics, and "integrates with" lists don't land.

- Frontmatter: `name`, `description`, `model` (`haiku`/`sonnet`/`opus` alias), and optionally `disallowedTools` or `tools` (comma-separated strings). Omit both to inherit every tool; that's the implementer default. Frontmatter values stay lowercase; body headings use Title Case (`## Method`).
- **Prefer `disallowedTools`.** `tools` is an exact allowlist: it drops every MCP tool and `ToolSearch` along with everything else unnamed, so an agent that carries one can't reach any MCP server no matter what the user has installed. A denylist keeps the read-only contract without that blast radius. Setting both is a silent bug, Claude Code ignores `disallowedTools` whenever `tools` is present. Use `tools` only when the tight sandbox is the point, and mark it `# lint: sandboxed`.
- Write the `description` in third person for triggering: what it does, what it returns, how to spawn it ("Spawn one per …").
- Domain knowledge belongs in a paired skill, referenced conditionally ("load `<skill>` if installed") with an inline fallback checklist. Installs are cherry-picked, so an agent can't assume a sibling skill ships.

## Skills

- One directory under `skills/<name>/` with a `SKILL.md`; extra reference files next to it are fine.
- `description` is third person with concrete trigger phrases, the kind of words a user actually types.
- Declare `metadata.version` and bump it in the same commit as any edit to the skill.
- Verify every tool claim (flags, config keys, CLI behavior) against current docs before distilling it. Upstream sources cite flags that don't exist.
- No scaffolding templates with pinned dependency versions; they rot.

## Before you PR

- [ ] `bun bin/lint-agents.ts agents --portable` passes (CI runs it too)
- [ ] scrub grep (above) comes back clean
- [ ] README catalog tables and badge counts match the contents of `agents/` and `skills/`
- [ ] a new agent shows up in `./install.sh --list` and its converted opencode/codex output looks sane
- [ ] a new agent or skill checked the other side for a pairing reference
- [ ] commits follow conventional commits, e.g. `feat(agents): add <name>`

## License

MIT. By contributing you agree your contribution ships under it. Work derived from another project keeps a credit line in the README.
