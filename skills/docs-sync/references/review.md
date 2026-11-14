# Review Mode

The `tech-writer` agent's whole `review` procedure. Read `doc-rules.md`, beside this file, whole before the first step: review verifies by its Claims and judges by its Writing.

You report every real issue in changed docs and instruction prose; you never fix one.

- Read this skill's `SKILL.md` whole at the start and add its criteria: claim classes, executable-bit and paraphrase checks, the prompt-file sweep on an output-shape change, Procedure step 7's staging rule with the staging test in Scope (in a project that stages user-facing doc changes, a diff outside the release pass that adds, changes or removes a code-derived claim in a user-facing doc is a finding), and its Style Rules except **Edit and shorten over adding** (that one judges a reconcile pass). The rest of its scope list, its delegation line, worktree ban, fix steps and Output section belong to reconcile; skip them.
- Without the task's request text, return the review unstarted and ask for it. With it, re-derive the required outcomes from the raw text and write one line per outcome before any finding, marking each that has no deliverable.

1. **Scope**: the caller's diff or file list; else derive it from `git diff-index -p -M HEAD` plus `git ls-files --others --exclude-standard --full-name :/`, marked derived (it can catch files someone else is still writing). Both list paths relative to the repo root (`git rev-parse --show-toplevel`), not the cwd. Review the changed prose and every other doc stating the same fact; read past the scope only for copies of, and links to, what the diff changed. A defect the diff neither introduced nor made worse (in the system a doc describes, or a line the diff left as it was) goes in Flagged as pre-existing, quoted and cited like a finding, never in the table; a stale copy or dead link step 3 finds, a doc the `missing` class names, and an untouched line the change now contradicts are defects the diff introduced.
2. **Claims**: list every checkable claim in each changed hunk and verify each (`doc-rules.md` Claims); never run a doc's install, setup, or build snippet.
3. **Sweep** past the diff in four fixed steps: the callers of each changed symbol (every inbound link to, and every file that loads or cites, a heading, anchor, file or rule the diff renamed, deleted or changed); sibling surfaces that render the same data (search the repo for each fact the diff changed, the noun, the number, the flag, to find copies it left behind); the user-facing entry, driven once by reaching the changed text the way its reader does (the index row, the link, the routing `description`, a built tool's `--help`), never by running a doc's snippet, and listed under **Not run** where you could not; docs and config naming the changed identifiers.
4. **Prose**: voice, duplication, and form last.

| class | what it catches |
|---|---|
| stale | the doc says X, the code does Y: counts and badge totals, defaults, version floors, example output, install steps; a prompt listing flags, fields, or an output shape its tool no longer has |
| overpromising | a feature, flag, platform, or guarantee the code lacks; a roadmap item in present tense; `tested`/`verified` with no test behind it |
| missing | a user-visible change in the same diff that no doc mentions (only when the diff carries code); in a project that stages user-facing doc changes (`SKILL.md` Scope), the change's staged record is that mention |
| dead-citation | a path, anchor, link, URL, symbol, skill, reference, agent, tool, or command that does not resolve or is not granted; a committed file citing a gitignored or untracked path; "the old X" or `HEAD~3` in place of a literal or pinned sha |
| duplicate | one fact or rule in two places; report both sites (the copy the diff did not touch is where drift lands); a pair failing the removable-duplicate test of `doc-rules.md` is a partial duplicate: name what only one site carries, and a diff that cut that site lost a rule |
| contradiction | opposite instructions for the same trigger, or overlapping rules with no stated winner; quote both |
| routing | a `description` or `when_to_use` whose triggers no longer match the body, or a body capability it never routes to |
| read-only | a read-only claim that granted tools or a body step contradict |
| portability | an absolute machine path (home-dir, tilde, drive-letter user path), hostname, IP, or private tool name in a file that ships |
| ambiguity | a rule a model can read two ways that change the action, or one with no failure behavior where an input can be missing |
| voice | departs from the doc's voice, person, tense, heading case, wrapping, or style guide; filler, hedging, marketing adjectives, a paragraph restating its heading |
| dated-record | a dated record judged against today's code instead of its own date |

- Every finding quotes the doc text verbatim (a `missing` one quotes the code change and names the doc that should carry it). Every finding except voice and ambiguity cites its evidence: code `file:line`, the other site's `file:line`, the granted tool or writing step, the dating `git show`, a command with its output, or the exact search command (pattern plus paths) that returned nothing, with its hit count. A suspicion you could not check goes in Unverified with what would settle it, never in the table.
- Anchor by quoted text where the repo runs a formatter that reflows markdown, by `file:line` otherwise.
- Severity is derived, never chosen. `reach:` the reader and input that get there (a user following the install step, a session loading the instruction file, a router reading the description), or `none under <scope>` plus the sweep that says so; `impact:` what that reader then does wrong. **blocker** = a behavior the brief or the repo's spec names breaks on a reachable input while every check stays green; **major** = other wrong behavior on a reachable input; **minor** = wrong with no reachable input today; **nit** = wording or style with no wrong behavior. Never grade by how serious a sentence sounds, by diff size, or by whether the label buys another round.
- Cite the rule a finding breaks; a defect no written rule covers says so and ranks no lower. Before quoting a rule from a named file, search that file for one distinctive word of the quote; before citing text as pre-existing, check it at the reviewed diff's base (the caller's base; else `HEAD` for a worktree diff; else `git merge-base HEAD <default branch>`).
- Flag every real issue; triage is the caller's job. A suggested rewrite follows the repo's precedent, spells the whole replacement text, adds no rule, branch or clause the finding does not need, and is checked against the same classes and sweep before it enters the table.

Report sections: Scope (the file set, marked caller-given or derived); a findings table `tag | anchor | class | doc says | evidence | reach | impact | fix` (`fix`: one line, or the full replacement text when wording is the fix); three fixed slots, `none` when empty: **Premises** (each premise of the brief you checked, and how), **Ran** (each command and its deciding output line), **Not run** (each check or probe, and why); the def's shared tail, ending with `objective: met | partial | unmet` as the last line.

A blocker or major row in the findings table means the verdict is `partial` or `unmet`, never `met`; an unrun probe on a required outcome caps it at `partial`.
