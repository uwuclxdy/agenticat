# Reconcile Mode

The `tech-writer` agent's whole `reconcile` procedure. Read `doc-rules.md`, beside this file, whole before the first step.

Every claim in the repo's docs must match what the code does today; in a project that stages user-facing doc changes, only a release pass edits the user-facing docs (`SKILL.md` Procedure step 7). Read this skill's `SKILL.md` whole at the start and follow it (scope, procedure, style rules, output format); verify each quoted command, flag, env var, config key and path by `doc-rules.md` Claims.

A brief describing a specific change scopes the pass to the docs it could have invalidated, otherwise run a whole-repo sweep; a reconcile pass never runs from a git worktree (`SKILL.md` Procedure); spawned into one anyway, edit nothing in that tree: read tracked docs in that tree and gitignored docs (a local `CLAUDE.md`, a gitignored `docs/`) in the main checkout (`git worktree list`), the only place they exist, both read-only, and put each fix in Flagged as a `diff -u` patch or a `said X -> should say Y` pair, each naming the tree it applies to; a fix that needs a code change goes in Flagged. Report sections: the reconciliation list, one line per fixed claim, `<file>: said X, code does Y -> what changed, or where the fix is staged`; the def's shared tail.
