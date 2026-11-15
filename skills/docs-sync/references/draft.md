# Draft Mode

The `tech-writer` agent's whole `draft` procedure. Read `doc-rules.md`, beside this file, whole before the first step.

You write a draft for the caller to apply; the target stays untouched. Inputs:

- **target**: the one instruction file; a target that does not exist yet is drafted as a new file only when the request asks for one.
- **request**: what should change, ideally quoted from the user.
- **draft path**: not the target; nonexistent unless the brief names it as the draft to revise; outside the target's repository (outside the target's directory when it sits in none); never under a `skills/`, `agents/`, `commands/`, `rules/` or `prompts/` directory (or a singular form) and never named `CLAUDE.md`, `AGENTS.md` or `GEMINI.md`, since a harness would load it as a second live copy. Check every rule on the resolved path: `realpath -m <draft path>`, or where `-m` is unsupported, `realpath` of its nearest existing ancestor joined with the rest; a revision round's draft is a regular file, never a symlink.
- **base hash**, revision rounds only: the `base` line from the report of the round that made the draft.
- optionally, sources the text must rest on: files, URLs, decisions.

1. Check the inputs against the rules above before any write.
2. Hash the target: `sha256sum <target>` (`shasum -a 256` where absent); a new file's hash is `absent`. A first round's hash is the `base`. A revision round's `base` is the brief's base hash, and a current hash that differs means applying the old draft would revert the target's newer changes: Failure Behavior below.
3. First round: `mkdir -p` the draft's parent, then `cp` the target to the draft path (a new file has nothing to copy). A revision round edits the named draft and skips the copy, which would wipe the reviewed edits.
4. Read the draft, never the target: the copy holds its bytes, and where a harness gates its edit and write tools on a prior read, a target never opened stays locked. A revision round sees the target through `diff -u <target> <draft>`; a sweep hit or convention file inside the target is read in the draft.
5. Sweep before drafting a line. For each rule the request adds or changes, `rg --hidden --no-ignore -g '!.git'` its key nouns and verbs in: the target's own directory; every `CLAUDE.md`, `AGENTS.md` or `GEMINI.md` in the target's directory, its ancestors and subdirectories; the repo's harness directories (`.claude/` with `commands/` and `rules/`, each other harness's agent, command and prompt directories); the user-level instruction file of the target's harness; the target's sibling defs or skills; in a git worktree, the main checkout too. Read around each hit and record a sweep row: a rule already covering the ask everywhere the target reaches (the removable-duplicate test of `doc-rules.md`) is `edit there` or `delete`, never a second copy (between two copies keep the one matching its source, never the more authoritative-looking one); one covering it only partly is `partial: <what only the target carries>`, which the draft keeps; a rule contradicting it is `conflict: needs a decision`, and the draft follows the request.
6. Draft by editing the draft file (a new file is written whole). Every rule or heading you delete or rename gets the step 5 reference search; each hit is an `edit there` row.
7. Check: re-hash the target and compare with step 2; produce `diff -u <target> <draft>` with both paths absolute (`/dev/null` for a new file; exit 1 = differ, 2 = the diff failed); run each host check on instruction files that accepts the draft path, in its read-only form, where `doc-rules.md` Trust allows, naming any that needs the file in place for the caller; where the host caps a description, measure every field the cap covers (a skill's `description` plus `when_to_use` when counted together) with the host's token counter, or report it unmeasured. A skill draft: write three questions a user would ask at the edge of its scope ("can it do X?", "what can't it do?") and confirm each is answered in the file its routing sends a reader to. A fresh-reader run after applying stays the caller's.

A brief asking you to apply the draft gets the draft and the report. Report sections:

1. `target: <path> sha256 <before> -> <after> (unchanged | CHANGED)`, `base: <sha256 the draft was copied from>`, `draft: <path>`.
2. The diff verbatim in a `diff` block under the exact command that produced it, never hand-typed, trimmed or reflowed; an empty diff says why no change was needed.
3. Citations, one row per added, changed or deleted rule: `# | rule (quoted, short) | source | quoted span | note`; a source is a `file:line`, a URL, or `request`, the span the exact words the rule rests on. A detail the span lacks gets its own row with source `none`, so the caller can strike it; a deleted rule cites the surviving copy. Citations live here, never as markers in the draft, unless the host cites inline.
4. Sweep: `site (file:line) | existing rule | verdict`; with no hits, the files and search terms covered.
5. Checks: each step 7 check with its result, or skipped with the reason.
6. The def's shared tail.

## Failure Behavior

- A draft revision round whose target hash differs from the base -> report both hashes and stop, writing nothing; the caller decides whether a fresh first round redrafts from the current target.
- A draft target whose hash changed between steps 2 and 7 -> `CHANGED` leads the def's Report item 2, every write you made is named, and the target is never restored.
