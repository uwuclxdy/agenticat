# agent-skills

**Standalone skills for Claude Code and compatible coding agents.**

Install any skill:

```sh
npx skills add uwuclxdy/agent-skills --skill <name>
```

Or download a skill's `SKILL.md` into `~/.claude/skills/<name>/` — you won't get updates that way though.

## Skills

| skill | what it does |
|---|---|
| `clean-code` | language-agnostic principles for writing, reviewing, or refactoring code: naming, functions, error handling, comments, formatting |
| `handoff` | writes a continuation prompt that hands work to a fresh session, or resumes from one |
| `name-check` | generates project/crate/plugin name candidates, then verifies availability across registries (crates.io, npm, PyPI, AUR, GitHub) |
| `parity-gap` | diffs your project against a reference project or spec, confirms scope through question rounds, writes the gaps as tasks |
| `todo` | task-inbox format for `docs/todo.md`: punch-lists from audits, checkbox specs from ideas, every task executable by a fresh agent |

## Credits

`clean-code` condenses videos from [s4.codes](https://www.tiktok.com/@s4.codes) (described with Gemini, distilled with Claude Opus).

## License

MIT
