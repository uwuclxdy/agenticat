<div align="center">

# agenticat

**Agents & Skills that I use, compatible with most AI coding tools** 

[![license](https://shields.uwuclxdy.dev/badge/license-MIT-blue)](LICENSE)
[![skills](https://shields.uwuclxdy.dev/badge/skills-17-green)](#skills)
[![agents](https://shields.uwuclxdy.dev/badge/agents-22-green)](#agents)

</div>

---

Everything here (should be) compatible with **opencode**, **Claude Code**, **Gemini CLI**, **Codex CLI**, **Cursor** and 73+ skill-compatible environments.

Skill and Agent frontmatter is in Claude Code compat format by default; use `npx skills` and/or bundled bun script to make them compatible with other harnesses (will do it in a better way when I decide how). 

**[Contributions](CONTRIBUTING.md) are welcome!**

## Install

> [!NOTE]
> Two plugins ship separately: `agents` and `skills`. Install one or both; on opencode/codex, cherry-pick by name with `./install.sh --to opencode prober web-researcher` (list with `./install.sh --list`). 

<details>
<summary>Claude Code</summary>

#### Agents

```
/plugin marketplace add uwuclxdy/agenticat
/plugin install agents@agenticat
```

#### Skills

```
/plugin install skills@agenticat
```

or cherry-pick with `npx skills`:
```
npx skills add uwuclxdy/agenticat --skill <name>
```
</details>

<details>
<summary>Gemini CLI</summary>

#### Agents

```
gemini extensions install https://github.com/uwuclxdy/agenticat --auto-update
```

> [!WARNING]
> Gemini's extension-bundled subagents are a preview feature, verify if it works on your version.

#### Skills

```
npx skills add uwuclxdy/agenticat -a gemini
```
</details>

<details>
<summary>opencode</summary>

#### Agents

```
git clone https://github.com/uwuclxdy/agenticat && cd agenticat
./install.sh --to opencode
```

#### Skills

```
npx skills add uwuclxdy/agenticat -a opencode
```
</details>

<details>
<summary>Codex CLI</summary>

#### Agents

```
git clone https://github.com/uwuclxdy/agenticat && cd agenticat
./install.sh --to codex
```

#### Skills

```
npx skills add uwuclxdy/agenticat -a codex
```
</details>

<details>
<summary>Cursor</summary>

#### Agents

Cursor reads `agents/` as claude format; copy files into `.claude/agents/` or `.cursor/agents/`.

#### Skills

```
npx skills add uwuclxdy/agenticat -a cursor
```
</details>

<details>
<summary>anything else (73+ harnesses)</summary>

no subagents yet.

#### Skills

```
npx skills add uwuclxdy/agenticat
```
</details>

Or just download into `~/.claude/skills/`, but then you won't get updates.

## Update

- Claude Code: `/plugin update agents@agenticat` and/or `/plugin update skills@agenticat` (every commit is a new version)
- Gemini CLI: automatic with `--auto-update`
- opencode / Codex: `./install.sh --update` pulls and reconverts what you installed
- Skills: `npx skills update`

## Skills

Install any skill with the same command, swapping the final name (see [Install](#install) for other harnesses):

```
npx skills add uwuclxdy/agenticat --skill <name>
```

The `used by` column is a soft link: when an agent's task touches what a skill covers it loads that skill for the deeper method. Cherry-pick either one alone and the loader falls back to its own built-in checklist.

| skill | origin | used by | what it does |
|---|---|---|---|
| `clean-code` | `s4.codes` | `python-reviewer`, `ts-reviewer` | language-agnostic readability and naming conventions |
| `handoff` | original | standalone | writes a continuation prompt for a fresh session, resumes from one too |
| `name-check` | original | standalone | proposes project or crate names, checks each for availability on registries and domains (needs `bun`) |
| `parity-gap` | original | standalone | diffs your project against a reference or spec, writes the gaps as tasks (calls `todo`) |
| `todo` | original | `parity-gap` | turns findings and loose notes into a clean `docs/todo.md`, each task pickup-cold ready |
| `askama` | original | `rust-pro` | conventions and reference for the askama Rust templating crate |
| `maud` | original | `rust-pro` | conventions and reference for the maud Rust `html!` macro |
| `cargo-toml-optimization` | original | `rust-pro` | tunes `Cargo.toml` and `.cargo` build profiles and features for faster compiles |
| `clean-rust` | original | `rust-pro` | idiomatic Rust conventions, modular: core rules plus per-domain references for errors, async, concurrency, unsafe, security, observability, testing, perf |
| `threat-modeling` | original | `threat-modeler` | STRIDE and attack trees, each requirement mapped to a mitigation |
| `clean-shell` | `wshobson` | `shell-pro`, `shell-reviewer` | defensive live-system idioms, `.shellcheckrc` discipline, bats-core testing; core rules plus a reference for each |
| `clean-flutter` | original | `flutter-pro`, `flutter-reviewer` | idiomatic Flutter/Dart conventions, modular: core rules plus per-domain references for architecture, state management, navigation, models/serialization, testing, pitfalls, packages |
| `emulator-testing` | original | `mobile-tester` | drives Android emulators and iOS simulators from the CLI: headless boot, adb/simctl primitives, Flutter test layers, screenshot verification |
| `skill-routing-audit` | original | standalone | audits a skill for routing gaps: boundary and negative questions that bury the real answer |
| `docs-sync` | original | `docs-reconciler` | reconciles README, docs, and CLAUDE.md (plus agent/skill prompt files) with what the code actually does |
| `ratatui-patterns` | original | `ratatui-pro` | modern ratatui built-ins, TestBackend render tests, a version-upgrade reference pack |
| `webapp-testing` | `anthropics` | `webapp-tester` | Playwright toolkit for testing local web apps, screenshots and console logs |

### origin

- `wshobson`: [wshobson/agents](https://github.com/wshobson/agents) (MIT)
- `s4.codes`: **content from [@s4.codes](https://www.tiktok.com/@s4.codes) (TikTok) as a Claude Skill**; Gemini transcribes the videos, Opus condenses them into the skill.
- `original`: self-authored
- `anthropics`: [anthropics/skills](https://github.com/anthropics/skills) (Apache-2.0), vendored with its LICENSE and a modification note
- `clean-rust` distills the author's own Rust conventions; a dozen standout rules were re-authored after studying [leonardomso/rust-skills](https://github.com/leonardomso/rust-skills) (MIT)

## External skills

Every third-party-origin item in the tables above is a copy this repo owns: the `wshobson` skills and `-pro` agents are rewrites, `webapp-testing` is vendored with its license, `clean-code` is distilled from transcripts. Installing them never pulls from the original source.

The one exception worth a look on its own: the [obra/superpowers](https://github.com/obra/superpowers) skills `systematic-debugging`, `test-driven-development`, and `verification-before-completion` (MIT) are not bundled here and install pristine from source with `npx skills add obra/superpowers --skill <name>`.

## Agents

Install with the Claude Code plugin (see [Install](#install)) or cherry-pick onto another harness with `./install.sh --to <harness> <name>`. Every definition is canonical Claude Code frontmatter; the converter keeps a read-only agent read-only (no Write or Edit) wherever it lands.

| agent | model | loads if installed | what it does |
|---|---|---|---|
| `python-reviewer` | inherit | `clean-code` | read-only Python diff/PR review with file:line and severity |
| `ts-reviewer` | inherit | `clean-code` | same for TypeScript and JavaScript |
| `docs-extractor` | inherit | none | digests a file or doc set into a brief, keeps raw bytes out of your context; coverage mode proves a doc safe to delete or merge |
| `spec-propagator` | opus | none | folds a decided spec into a design doc in that doc's own voice |
| `threat-modeler` | opus | `threat-modeling` | STRIDE and attack-tree threat model, writes one doc |
| `prober` | haiku | none | runs a build, test or lint, returns pass/fail instead of the full log |
| `web-researcher` | inherit | none | runs one research question through many searches, returns a cited markdown brief |
| `webapp-tester` | inherit | `webapp-testing` | drives a local app via Playwright, reports pass/fail with screenshots |
| `shell-pro` + | inherit | `clean-shell` | writes or refactors bash or POSIX sh, verifies with shellcheck |
| `golang-pro` + | inherit | none | one module-sized Go task, proven with the repo's gate and race detector |
| `rust-pro` + | inherit | `clean-rust`, `cargo-toml-optimization`, `askama`, `maud` | one Rust task against the repo's cargo and clippy gate |
| `c-cpp-pro` + | inherit | none | C and C++ with explicit ownership, sanitizers wired to the repo build |
| `flutter-pro` | inherit | `clean-flutter` | one Flutter/Dart task against the repo's analyze/format/test gate |
| `flutter-reviewer` | opus | `clean-flutter` | read-only Flutter/Dart diff/PR review with file:line and severity |
| `mobile-tester` | sonnet | `emulator-testing` | drives a local Android AVD or iOS simulator, reports pass/fail with screenshots |
| `rust-reviewer` | opus | `clean-rust` | read-only Rust diff/PR review: correctness, safety, async, invariants |
| `shell-reviewer` | sonnet | `clean-shell` | read-only shell/bash review: quoting, error handling, injection, portability |
| `root-cause-investigator` | opus | none | evidence-first root-cause hunt for disputed regressions, returns a hypothesis ledger |
| `tui-tester` | sonnet | none | drives a TUI/CLI in a real tmux pty like a user, reports pass/fail with captured screens |
| `frontend-builder` | sonnet | none | builds self-contained single-file frontends: canvas/WebAudio demos, SVG and favicon glyphs |
| `docs-reconciler` | sonnet | `docs-sync` | reconciles README, docs, and CLAUDE.md with the code, edits docs only |
| `ratatui-pro` | sonnet | `ratatui-patterns` | one Rust TUI task with current ratatui built-ins plus TestBackend tests |

- `loads if installed` is soft, has the same fallback rule as the skills table. 
- `+` began as [wshobson/agents](https://github.com/wshobson/agents) personas (MIT), rewritten and debloated.

## External repos checked

Repos evaluated as skill or agent sources. Adopted ones are marked; the rest were passed over for the reason given.

<details>
<summary>show the list</summary>

- `wshobson/agents`: adopted. source of the shell skills and the `-pro` agents, all rewritten and debloated.
- `obra/superpowers`: linked external, see [External skills](#external-skills).
- `anthropics/skills`: `webapp-testing` vendored (Apache-2.0).
- `vercel-labs/skills`: adopted as the `npx skills` installer, not a content source.
- `VoltAgent/awesome-claude-code-subagents`: 100+ subagent index, generic, nothing worth vendoring.
- `0xfurai/claude-code-subagents`: `playwright-expert` too thin, wrote own `webapp-tester`.
- `vijaythecoder/awesome-claude-agents`: `frontend-developer` compared, no fit.
- `yusuftayman/playwright-cli-agents`: CLI-focused, replaced by own `webapp-tester`.
- `rshah515/claude-code-subagents`: browsed, generic bulk.
- `contains-studio/agents`: `frontend-developer` compared, redundant.
- `lodetomasi/agents-claude-code`: `playwright-pro` fetched, redundant.
- `darcyegb/ClaudeCodeAgents`: `qa-engineer` link 404'd, dead.
- `leonardomso/rust-skills`: vendored once then delisted. one fat `SKILL.md`, not modular enough. its standout rules were later re-authored into the first-party `clean-rust`.
- `actionbook/rust-skills`: competing rust system, passed over.
- `vercel-labs/open-plugin-spec`: spec only, nothing implements it.
- `affaan-m/ecc`: "67 agents, 271 skills" claims unverified.
- `numman-ali/openskills`: skills-only, no agent definitions.
- `anthropics/claude-code`: read for plugin-marketplace mechanics (issue #20301), not content.
- `google-gemini/gemini-cli`: read for extension and subagent mechanics.
- `charmbracelet/crush`: subagent format unshipped at research time.
- `cursor/plugins`: spec has no agent-definition concept.
- `mohitagw15856/pm-claude-skills`: `--agent` picks a destination harness, not agent defs.
- `dmicheneau/opencode-template-agent`: template, not an installer.
- `antfu/skills-npm`: competing install-from-npm concept.
- `VintLin/skill-flow`: competing cross-agent skill manager.
- `hesreallyhim/awesome-claude-code`: index only, used for discovery.
- `sickn33/antigravity-awesome-skills`: bulk dump, no curation.
- `google-labs-code/stitch-skills`: unrelated, cited only for an issue.
- `gemini-cli-extensions/security`: gemini-specific.
- `Piebald-AI/claude-code-system-prompts`: system-prompt mirror, reference only.
- `agentskills/agentskills`: spec site, not content.

About 30 more were surveyed in a separate trending/growth analysis, not as adoption candidates, and are omitted here.

</details>

## License

MIT. 

Skills with a third-party origin keep their upstream licenses (see [origin](#origin)).
