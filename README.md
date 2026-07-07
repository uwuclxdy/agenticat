# agenticat

**Curated agents + skills for AI coding harnesses: one repo, installable everywhere.**

[![license](https://shields.uwuclxdy.dev/badge/license-MIT-blue)](LICENSE)
[![skills](https://shields.uwuclxdy.dev/badge/skills-10-green)](#skills)
[![agents](https://shields.uwuclxdy.dev/badge/agents-9-green)](#agents)

Skills teach a model a procedure; agents are ready-made subagents with scoped tools and a tuned prompt. Both live here in Claude Code's format, install through each harness's own tooling, converted only where a harness has no native support.

## Install

| harness | agents | skills |
|---|---|---|
| Claude Code | `/plugin marketplace add uwuclxdy/agenticat` then `/plugin install agenticat@agenticat` | same plugin, or cherry-pick: `npx skills add uwuclxdy/agenticat --skill <name>` |
| Gemini CLI | `gemini extensions install https://github.com/uwuclxdy/agenticat --auto-update` | `npx skills add uwuclxdy/agenticat -a gemini` |
| opencode | `git clone https://github.com/uwuclxdy/agenticat && cd agenticat && ./install.sh --to opencode` | `npx skills add uwuclxdy/agenticat -a opencode` |
| Codex CLI | `./install.sh --to codex` (after clone, as above) | `npx skills add uwuclxdy/agenticat -a codex` |
| Cursor | reads `agents/` as claude format; copy files into `.claude/agents/` or `.cursor/agents/` | `npx skills add uwuclxdy/agenticat -a cursor` |
| anything else | no subagent support → skip agents | `npx skills add uwuclxdy/agenticat` (73+ harnesses) |

Cherry-pick agents by name: `./install.sh --to opencode probe-agent web-researcher`. List everything: `./install.sh --list`. Gemini's extension-bundled subagents are a preview feature; verify against your installed version.

## Update

- Claude Code: `/plugin update agenticat` (every commit is a new version)
- Gemini CLI: automatic with `--auto-update`
- opencode / Codex: `./install.sh --update` (pulls, reconverts what you installed)
- skills: `npx skills update`

## Agents

| agent | model | what it does |
|---|---|---|
| `python-code-reviewer` | sonnet | read-only Python diff/PR review: correctness, typing, security, clarity, with file:line + severity |
| `ts-code-reviewer` | sonnet | read-only TS/JS diff/PR review: correctness, type-safety, XSS, clarity |
| `doc-coverage-audit` | sonnet | deletion-safety check: what a source doc contains that target docs don't cover |
| `docs-extractor` | sonnet | digests a file/doc set into a structured brief against your question template, keeping raw bytes out of the caller's context |
| `spec-propagation` | opus | folds a decided spec/changelog block into a design doc while preserving its voice |
| `threat-modeling-expert` | opus | STRIDE + attack-tree threat modeling for a system/feature; writes only the threat-model doc |
| `probe-agent` | haiku | runs a command, returns a compact pass/fail probe instead of the full log |
| `web-researcher` | sonnet | single-topic web research: multi-query search, source fetch, cited markdown brief |
| `webapp-tester` | sonnet | drives a local web app with Playwright, reports pass/fail with screenshots + console logs |

Defs are canonical Claude Code frontmatter (`name`, `description`, `tools`, `model`). The converter maps tools to opencode's boolean map and Codex's `sandbox_mode` (agents without Write/Edit stay read-only).

## Skills

| skill | what it does |
|---|---|
| `clean-code` | language-agnostic principles for writing, reviewing, or refactoring code: naming, functions, error handling, comments, formatting |
| `handoff` | writes a continuation prompt that hands work to a fresh session, or resumes from one |
| `name-check` | generates project/crate/plugin name candidates, then verifies availability across registries (crates.io, npm, PyPI, AUR, GitHub) |
| `parity-gap` | diffs your project against a reference project or spec, confirms scope through question rounds, writes the gaps as tasks |
| `todo` | task-inbox format for `docs/todo.md`: punch-lists from audits, checkbox specs from ideas, every task executable by a fresh agent |
| `askama` | conventions and reference for the askama Rust templating crate |
| `cargo-toml-optimization` | Cargo.toml / .cargo tuning: profiles, features, workspaces, build speed |
| `rust-call-graph` | visualize Rust function call graphs (who-calls / what-calls) via LSP |
| `rust-trait-explorer` | explore Rust trait implementations (who implements what) via LSP |
| `threat-modeling` | STRIDE, attack trees, security-requirement extraction, mitigation mapping |

### External skills

Strong third-party skills live in their own repos. Pull just the one you want with `npx skills`; the `--skill` flag cherry-picks so the rest of each collection stays out:

| skill(s) | source | install |
|---|---|---|
| `systematic-debugging`, `test-driven-development`, `verification-before-completion` (and more) | [obra/superpowers](https://github.com/obra/superpowers) (MIT) | `npx skills add obra/superpowers --skill <name>` |
| `rust-skills` (265 Rust rules) | [leonardomso/rust-skills](https://github.com/leonardomso/rust-skills) (MIT) | `npx skills add leonardomso/rust-skills` |
| `webapp-testing` (Playwright frontend testing) | [anthropics/skills](https://github.com/anthropics/skills) (Apache-2.0) | `npx skills add anthropics/skills --skill webapp-testing` |

## Credits

- `clean-code` condenses videos from [s4.codes](https://www.tiktok.com/@s4.codes) (described with Gemini, distilled with Claude Opus).
- External skills link to their upstream repos, which carry their own attribution and licenses.

## License

MIT. Linked external skills install from upstream and keep their own licenses.
