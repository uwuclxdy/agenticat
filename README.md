<div align="center">

# crosskit

**Curated agents + skills for AI coding harnesses — one repo, installable everywhere.**

Works with Claude Code, opencode, Gemini CLI, Codex CLI, Cursor and 70+ skill-compatible agents.

[![license](https://shields.uwuclxdy.dev/badge/license-MIT-blue)](LICENSE)
[![skills](https://shields.uwuclxdy.dev/badge/skills-15-green)](#skills)
[![agents](https://shields.uwuclxdy.dev/badge/agents-8-green)](#agents)

</div>

Skills teach a model a procedure; agents are ready-made subagents with scoped tools and a tuned prompt. Both live here in Claude Code's format (the richest), install through each harness's own tooling, and get converted only where a harness has no native support.

## Install

| harness | agents | skills |
|---|---|---|
| Claude Code | `/plugin marketplace add uwuclxdy/crosskit` then `/plugin install crosskit@crosskit` | same plugin, or cherry-pick: `npx skills add uwuclxdy/crosskit --skill <name>` |
| Gemini CLI | `gemini extensions install https://github.com/uwuclxdy/crosskit --auto-update` | `npx skills add uwuclxdy/crosskit -a gemini` |
| opencode | `git clone https://github.com/uwuclxdy/crosskit && cd crosskit && ./install.sh --to opencode` | `npx skills add uwuclxdy/crosskit -a opencode` |
| Codex CLI | `./install.sh --to codex` (after clone, as above) | `npx skills add uwuclxdy/crosskit -a codex` |
| Cursor | reads `agents/` as claude format — copy files into `.claude/agents/` or `.cursor/agents/` | `npx skills add uwuclxdy/crosskit -a cursor` |
| anything else | no subagent support → skip agents | `npx skills add uwuclxdy/crosskit` (73+ harnesses) |

Cherry-pick agents by name: `./install.sh --to opencode probe-agent web-researcher`. List everything: `./install.sh --list`.

## Update

- Claude Code: `/plugin update crosskit` (every commit is a new version)
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
| `probe-agent` | haiku | runs a command, returns a compact pass/fail probe instead of the full log |
| `web-researcher` | sonnet | single-topic web research: multi-query search, source fetch, cited markdown brief |
| `webapp-tester` | sonnet | drives a local web app with Playwright, reports pass/fail with screenshots + console logs |

All defs are canonical Claude Code frontmatter (`name`, `description`, `tools`, `model`). The converter maps tools to opencode's boolean map and Codex's `sandbox_mode` (agents without Write/Edit stay read-only).

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
| `rust-skills` | 265 Rust rules across 26 categories: ownership, errors, async, unsafe, API design, perf |
| `rust-call-graph` | visualize Rust function call graphs (who-calls / what-calls) via LSP |
| `rust-trait-explorer` | explore Rust trait implementations (who implements what) via LSP |
| `systematic-problem-solving` | root-cause investigation + principles-first reasoning before committing to a fix |
| `test-driven-development` | failing test before implementation, for any feature or bugfix |
| `threat-modeling` | STRIDE, attack trees, security-requirement extraction, mitigation mapping |
| `verification-before-completion` | evidence before "done": run the checks, confirm the output |
| `webapp-testing` | Playwright toolkit for verifying frontend behavior in local web apps |

## How it stays in sync

Claude Code format is the single source of truth. Native installers (Claude Code plugin, Gemini extension, `npx skills`) read the repo as-is; `bin/install-agents.ts` (bun, zero deps) generates opencode markdown and Codex TOML on install. No generated content is checked in — conversion happens on the consumer's machine at install time.

## Alternatives

| project | difference |
|---|---|
| [anthropics/skills](https://github.com/anthropics/skills) | official skill collection; skills only, Claude Code-centric |
| [wshobson/agents](https://github.com/wshobson/agents) | much larger catalog (194 agents); pre-generates per-harness artifacts via make, checked in |
| [vercel-labs/skills](https://github.com/vercel-labs/skills) | the installer CLI this repo relies on for skills; not a content collection |

crosskit stays deliberately small: fewer, heavily-used artifacts over volume.

## FAQ

**How do I install a Claude Code subagent in opencode?**
Clone this repo and run `./install.sh --to opencode` — it converts the frontmatter (tools list → boolean map, model alias → provider id) and writes to `~/.config/opencode/agents/`.

**Can I install just one skill without the rest?**
`npx skills add uwuclxdy/crosskit --skill <name>` installs exactly one.

**Do the agents work outside Claude Code?**
Yes: opencode, Gemini CLI, Codex CLI and Cursor (see Install). Harnesses without custom-subagent support can still use all skills.

## Credits

`clean-code` condenses videos from [s4.codes](https://www.tiktok.com/@s4.codes) (described with Gemini, distilled with Claude Opus).

## License

MIT
