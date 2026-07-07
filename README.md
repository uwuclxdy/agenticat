# agenticat

**Curated agents + skills for AI coding harnesses: one repo, installable everywhere.**

[![license](https://shields.uwuclxdy.dev/badge/license-MIT-blue)](LICENSE)
[![skills](https://shields.uwuclxdy.dev/badge/skills-10-green)](#skills)
[![agents](https://shields.uwuclxdy.dev/badge/agents-9-green)](#agents)

A skill teaches a model a procedure; an agent is a ready-made subagent with scoped tools and a tuned prompt. Both are written in Claude Code's format and install through each harness's own tooling. Where a harness can't read that format natively, a small converter handles it on the way in.

## Install

| harness | agents | skills |
|---|---|---|
| Claude Code | `/plugin marketplace add uwuclxdy/agenticat` then `/plugin install agenticat@agenticat` | same plugin, or cherry-pick: `npx skills add uwuclxdy/agenticat --skill <name>` |
| Gemini CLI | `gemini extensions install https://github.com/uwuclxdy/agenticat --auto-update` | `npx skills add uwuclxdy/agenticat -a gemini` |
| opencode | `git clone https://github.com/uwuclxdy/agenticat && cd agenticat && ./install.sh --to opencode` | `npx skills add uwuclxdy/agenticat -a opencode` |
| Codex CLI | `./install.sh --to codex` (after clone, as above) | `npx skills add uwuclxdy/agenticat -a codex` |
| Cursor | reads `agents/` as claude format; copy files into `.claude/agents/` or `.cursor/agents/` | `npx skills add uwuclxdy/agenticat -a cursor` |
| anything else | no subagent support → skip agents | `npx skills add uwuclxdy/agenticat` (73+ harnesses) |

Cherry-pick agents by name with `./install.sh --to opencode probe-agent web-researcher`, or list everything with `./install.sh --list`. Gemini's extension-bundled subagents are a preview feature, so verify them against your installed version.

## Update

- Claude Code: `/plugin update agenticat` (every commit is a new version)
- Gemini CLI: automatic with `--auto-update`
- opencode / Codex: `./install.sh --update` pulls and reconverts what you installed
- skills: `npx skills update`

## Agents

Every definition is canonical Claude Code frontmatter (`name`, `description`, `tools`, `model`). The converter maps the tool list to opencode's boolean map and to Codex's `sandbox_mode`, so an agent that never got Write or Edit stays read-only wherever it lands.

### `python-code-reviewer` (sonnet)

Reviews Python diffs and PRs without editing anything of yours. It calls out correctness bugs, shaky typing, security holes and unclear code, each with a file:line and a severity so you know what to look at first.

### `ts-code-reviewer` (sonnet)

The same idea for TypeScript and JavaScript. It watches for correctness slips, loose or unsound types, XSS holes and muddy code, and reports them read-only with file:line and severity.

### `doc-coverage-audit` (sonnet)

Run this before you delete a doc. It checks whether anything the doc covers is missing from the docs you're keeping, so you don't quietly drop the last copy of something that mattered.

### `docs-extractor` (sonnet)

Reads a single file or a whole doc set and hands back a structured brief that answers your questions. The point is that the raw text stays in the subagent, so your own context window never fills up with it.

### `spec-propagation` (opus)

Takes a spec or changelog block you've already decided on and folds it into an existing design doc. It keeps that doc's own voice rather than pasting in something that reads like it came from somewhere else.

### `threat-modeling-expert` (opus)

Works a system or feature through STRIDE and attack trees, then writes the threats and their mitigations up as a document. It reads your code freely but only ever writes that one file.

### `probe-agent` (haiku)

Runs a build, test or lint command and returns a small pass/fail probe rather than the full log. Reach for it when you only need the verdict, not a wall of output in your context.

### `web-researcher` (sonnet)

Digs into a single research question across several searches, fetches and cross-checks the sources, then writes a cited markdown brief. One topic per run keeps it focused.

### `webapp-tester` (sonnet)

Drives a local web app through Playwright to confirm a flow actually works. It reports pass or fail and leaves screenshots and console logs behind as evidence.

## Skills

### `clean-code`

Language-agnostic principles for writing, reviewing or refactoring code. It covers how to name things, shape functions, handle errors and lay code out so the code ends up explaining itself.

### `handoff`

Writes a continuation prompt that hands the current work to a fresh session. It also works the other way, picking the work back up from a handoff someone left you.

### `name-check`

Comes up with candidate names for a project, crate or plugin, then checks each one for availability across crates.io, npm, PyPI, AUR and GitHub before you commit to it.

### `parity-gap`

Compares your project against a reference project or a spec. It confirms the scope with you over a couple of question rounds, then writes the missing pieces up as tasks you can work through.

### `todo`

Turns audit findings and loose notes into a tidy `docs/todo.md`. Each task is phrased so a fresh agent could pick it up cold and know exactly what to do.

### `askama`

Conventions and a reference for the askama Rust templating crate, so you write its templates the way the crate actually expects rather than fighting it.

### `cargo-toml-optimization`

Tunes a `Cargo.toml` or `.cargo` config: build profiles, feature flags, workspace layout and the settings that bring compile times down.

### `rust-call-graph`

Traces Rust function call graphs over LSP, so you can see who calls a given function or what that function calls in turn.

### `rust-trait-explorer`

Explores Rust trait implementations over LSP: which types implement a trait, or which traits a given type carries.

### `threat-modeling`

The method the `threat-modeling-expert` agent runs on. It walks STRIDE questions and attack trees, pulls security requirements out of the design and maps each one to a concrete mitigation.

## External skills

Some third-party skills are worth reaching for but not worth copying in here. Pull just the one you want with `npx skills`; the `--skill` flag cherry-picks it so the rest of a collection stays out of your setup.

### superpowers

Jesse Vincent's skill collection ([obra/superpowers](https://github.com/obra/superpowers), MIT). The standouts to cherry-pick are `systematic-debugging`, `test-driven-development` and `verification-before-completion`, among others. Install one with `npx skills add obra/superpowers --skill <name>`.

### rust-skills

265 Rust rules across ownership, errors, async, unsafe, API design and performance ([leonardomso/rust-skills](https://github.com/leonardomso/rust-skills), MIT). It's a single skill, so pull the whole thing with `npx skills add leonardomso/rust-skills`.

### webapp-testing

Anthropic's Playwright toolkit for exercising local web apps ([anthropics/skills](https://github.com/anthropics/skills), Apache-2.0). It's the skill the `webapp-tester` agent leans on for its server lifecycle. Install it with `npx skills add anthropics/skills --skill webapp-testing`.

## Credits

`clean-code` condenses videos from [s4.codes](https://www.tiktok.com/@s4.codes), described with Gemini and distilled with Claude Opus. The external skills above link back to their own repos, which carry their attribution and licenses.

## License

MIT. The linked external skills install from upstream and keep their own licenses.
