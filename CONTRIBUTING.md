# Contributing

Welcome contributions: new agents, new skills, fixes to existing ones, and README links to good third-party skills.

## Ground rules

- **Claude Code format is canonical.** `agents/*.md` and `skills/<name>/SKILL.md` are the source of truth; opencode/codex output derives from them at install time via `bin/install-agents.ts`. Don't PR generated files.
- **Don't PR a vendored third-party skill.** If a skill you didn't write is worth sharing, PR a row in the README's external skills table instead. It installs from its own repo with `npx skills add <owner>/<repo> --skill <name>`. A few are vendored here (`webapp-testing`, Apache-2.0), each with its LICENSE and a modification note; that call stays with the maintainer.
- **Nothing personal or machine-specific**: absolute paths, IPs, hostnames, private tooling. `git grep -nE '/hom[e]/|192[.]168[.]|cloudif[y]|cloudy[-]|/User[s]/|/mn[t]/'` must come back clean; run it after `git add` so new files are scanned. This is the same scan the CI gate runs.
- **Headings use Title Case**, in agent bodies (`## Method`) and skills alike, the H1 included: one echoing the kebab `name` reads `# Name Check`, not `# name-check`.
  - Headings inside fenced templates and bare DSL keywords (`{% include %}`, `set`) keep their literal case.
  - A re-cased heading gets its ToC link text re-cased to match.
- **Name an agent as an agentive noun** (`prober`, `code-explorer`): `<domain>-pro` for an implementer, `<domain>-reviewer` for a reviewer, `<target>-tester` for a tester. A skill takes a plain descriptive kebab-case name (`name-check`), never an agent suffix.

## Agents

An agent def is a thin implementer: a method, quality gates, and an output contract. Persona intros, invented delivery metrics, and "integrates with" lists don't land.

- Frontmatter: `name`, `description`, optionally `model` (`haiku`/`sonnet`/`opus` alias; omit it to inherit the caller's model, the default for language implementers), and optionally `disallowedTools` or `tools` (comma-separated strings). The block must parse as YAML with each of these fields a string: the converter refuses one that does not, and the lint errors on it. Omit both to inherit every tool; that's the implementer default. `name` and `model` values stay lowercase.
- **Mark a def that gets no edit or spawn tool `# lint: read-only`.** A def that must get no edit, spawn or worktree tool (it may still write through Bash where its body allows: `prober`'s builds, a reviewer's report outside the repo) carries `# lint: read-only` in its frontmatter and a top-level `- **Read-only.**` hard-rule bullet (0-3 columns of indent; a deeper, fenced or commented-out copy does not count); the lint then refuses any `Edit`, `Write`, `NotebookEdit`, `Agent`, `Task` or `EnterWorktree` grant, and treats a missing bullet or a denylist without all six as an error. A `# lint:` line holds the directives, separated by commas or spaces, with any extra prose after the first full stop. Several `# lint:` lines merge. An unknown directive is an error.
- **List the checks of a def without write tools that grants Bash.** A def that grants Bash but neither `Write` nor `Edit`, and carries no `# sandbox:` marker, gets a deny-all opencode bash map plus shared read commands; list each fixed tool check its body names in a `# opencode-bash-allow: <pattern>, <pattern>` frontmatter comment, as an exact command (`cargo check --all-targets`) or with a literal `-- *` before its paths (`ruff check --no-fix -- *`), so no added flag fits; only a command with no flag that writes (`shellcheck *`, the `gh` reads) may end in a bare ` *` (`*` matches any run of characters, a trailing ` *` also matches the bare command). A flag deny cannot stand in for that: opencode matches the raw command text and the shell joins quote-split words, so `rg --p''re` passes a `--pre` deny. A test run or a repo-defined script or task (`tox`, `npm run`, `scripts/lint.sh`) stays off the line, so opencode refuses it. Several such lines merge in order. The converter refuses the comment on a def that writes files or grants no Bash, and refuses a pattern equal to one of its own deny rules or holding `*` or `?` in its command word or in any word but its last (`cargo * --help`); the lint reports every one of these refusals too.
- **Mark a def whose commands write `# sandbox: workspace-write`.** The converter writes `sandbox_mode = "read-only"` into the Codex file of a def that grants neither `Write` nor `Edit` (whether Codex applies it: the README's Codex CLI install notes). A def whose Bash job writes files (builds, test runs, as in `prober`) carries `# sandbox: workspace-write` in its frontmatter so the converter writes `workspace-write` instead; the marker also drops its opencode bash map. The converter checks every such line and refuses any other value and anything after the value.
- **Write every frontmatter marker exactly.** `# lint:`, `# opencode-bash-allow:` and `# sandbox:` start at column 0: `#`, optional spaces or tabs, the lowercase key, the colon right after it. A capitalised, suffixed or indented spelling (`# Sandbox:`, `# sandboxed:`, `  # lint:`), a space before the colon, an allow key missing a part (`# bash-allow:`, `# opencode-allow:`), or the key written as a top-level YAML key is a near miss; a `#` inside a YAML value (quoted or block scalar) is data. The lint errors on every near miss and on an unknown `# sandbox:` value or anything after it; the converter refuses the `# sandbox:` and `# opencode-bash-allow:` ones.
- **Prefer `disallowedTools`.** `tools` is an exact allowlist: it drops every MCP tool and `ToolSearch` along with everything else unnamed, so an agent that carries one can't reach any MCP server no matter what the user has installed. A denylist keeps the read-only contract without that blast radius. Setting both is a silent bug, Claude Code ignores `disallowedTools` whenever `tools` is present. Use `tools` only when the tight sandbox is the point, and mark it `# lint: sandboxed`.
- Write the `description` in third person for triggering, in this order: what it does, a " - Use when" clause (or " - Use after", " - Use for") listing the concrete trigger situations, how to spawn it ("Spawn one per …"), then any boundary clause. State what it returns and any limit on what it may write either in the first slot or just before the spawn unit.
  - Cap the fields a router reads at 130 tokens: an agent's `description`, a skill's `description` plus `when_to_use`.
  - A list of specifics (file types, commands, tool names, error text) routes better than one polished generalization.
  - Separate confusable siblings by sharpening each one's own triggers first.
  - Add one terse boundary clause (``Not for reviewing a diff (`rust-reviewer`)``) only between siblings that share trigger vocabulary, where the user's sentence alone cannot split them. In this catalog those are each `-pro`/`-reviewer` pair, plus `web-pro`/`ux-pro` and `web-reviewer`/`ux-reviewer`, which share UI and template vocabulary; the web pair's one clause names both of its siblings.
  - Cut every token that does not help pick the item over a sibling, and never pad toward a length.
  - These rules and the skill rules below cover every field a router reads: an agent's `description`, and a skill's `description` and `when_to_use`. A marketplace, `plugin.json` or `gemini-extension.json` description is browse copy for people.
- Domain knowledge belongs in a paired skill, referenced conditionally ("load `<skill>` if installed") with an inline fallback checklist. Installs are cherry-picked, so an agent can't assume a sibling skill ships.

## Skills

- One directory under `skills/<name>/` with a `SKILL.md`; extra reference files next to it are fine.
- `description` states what the skill covers in third person; `when_to_use` holds the concrete trigger phrases (`Use when …`), the kind of words a user actually types.
  - A slash-only skill (`disable-model-invocation: true`) is exempt from trigger phrases.
  - So is a reference pack an agent loads by name (`askama`, `maud`, loaded by `rust-pro`): its `description` stays a bare disambiguator with no `when_to_use`, so it carries no triggers to compete with.
- Declare `metadata.version` and bump it in the same commit as any edit to the skill.
  - The bump is per commit, not per edit: while the version field is itself uncommitted (`git diff HEAD -- <file>` shows it, as for a new skill or a pending batch), further edits fold into that pending version.
- Verify every tool claim (flags, config keys, CLI behavior) against current docs before distilling it. Upstream sources cite flags that don't exist.
- No scaffolding templates with pinned dependency versions; they rot.

## Before you PR

- [ ] `bun bin/lint-agents.ts agents --portable` passes (CI runs it too; an agent `name` is lowercase letters, digits and hyphens, starts with a letter or digit, and matches its file name)
- [ ] `bun test bin/` passes when you touch `bin/` or add a def that gets an opencode bash map (grants Bash, no `Write`/`Edit`, no `# sandbox:`); such a def needs a `DECLARED_CHECKS` row in `bin/install-agents.test.ts` listing its `# opencode-bash-allow:` patterns, or `[]`
- [ ] a renamed agent, or one folded into another, gets a row in `RENAMES` in `bin/install-agents.ts` pointing at its successor, and any older row pointing at the old name is re-pointed to the new one, so `./install.sh --update` carries existing installs over
- [ ] scrub grep (above) comes back clean
- [ ] README catalog tables and badge counts match the contents of `agents/` and `skills/`
- [ ] a new agent shows up in `./install.sh --list` and its converted opencode/codex output looks sane
- [ ] a new agent or skill checked the other side for a pairing reference
- [ ] commits follow conventional commits, e.g. `feat(agents): add <name>`

## License

MIT. By contributing you agree your contribution ships under it. Work derived from another project keeps a credit line in the README.
