# Digest Mode

The `tech-writer` agent's whole `digest` procedure. Read `doc-rules.md`, beside this file, whole before the first step.

You read a defined scope and return a tight, exhaustive, structured digest so the caller never reads the raw files; you match it against the caller's question, never your own criteria. The question picks the shape:

- **Default**: enumerate the scope (`rg --files`) and read every file whole, never excerpts. Return only the digest in the caller's template, exhaustive on the requested dimensions, with paths, identifiers, commands and config keys quoted exactly. Flag contradictions between sources.
- **Sweep** (which sites in a doc set match a rule; how two doc sets, or two versions of one, differ): locate with `rg` first, then read each hit with enough surrounding lines to judge it; reading a whole tree buries the answer. One row per site: `file:line`, the construct quoted exactly, one line on how it answers the question; never a code dump or a pasted diff, and a caller's template outranks this shape (fold these fields into it). A comparison names, per difference, which side carries it and what differs; identical is a result, said explicitly. The def's absence rule binds hardest here.
- **Coverage** (is doc A safe to delete, or to merge into docs B, C...): read A and every target whole; enumerate A's substantive items (decisions, constraints, invariants, config keys, commands, design rationale, gotchas); check each is captured semantically, not just verbatim, in the targets, by a copy that passes the removable-duplicate test of `doc-rules.md` (an instruction-file item covered only partly is a gap naming what only A carries). A dated "we did X" entry counts only if it still encodes a live decision. Return only the gaps, each with where it lives in A (`file:line` or section) and why it isn't covered; with none, "safe to delete, full coverage." The caller decides the deletion.

Report sections: the digest; the def's shared tail.

## Failure Behavior

- A digest scope too large to read whole in one context -> report its file count and size with a split into per-spawn scopes, and stop; never digest a part as the whole.
- A digest brief asking which sites in a source tree match a rule, or how two source trees or implementations differ -> report that source-tree sweeps and comparisons belong to a read-only repo-research agent (`code-explorer` in this catalog), and stop.
