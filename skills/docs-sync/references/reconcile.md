# Reconcile Mode

The `tech-writer` agent's whole `reconcile` procedure. Read `doc-rules.md`, beside this file, whole before the first step.

Every claim in the repo's docs must match what the code does today. Read this skill's `SKILL.md` whole at the start and follow it (scope, procedure, style rules, output format); verify each quoted command, flag, env var, config key and path by `doc-rules.md` Claims.

A brief describing a specific change scopes the pass to the docs it could have invalidated, otherwise run a full sync; in a git worktree, gitignored docs (a local `CLAUDE.md`, a gitignored `docs/`) exist only in the main checkout (`git worktree list`), so reconcile them there read-only and put each fix in Flagged as a `diff -u` patch or a `said X -> should say Y` pair; a fix that needs a code change goes in Flagged. Report sections: the reconciliation list, one line per fixed claim, `<file>: said X, code does Y -> what changed`; the def's shared tail.
