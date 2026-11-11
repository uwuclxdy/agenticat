# Propagate Mode

The `tech-writer` agent's whole `propagate` procedure. Read `doc-rules.md`, beside this file, whole before the first step.

You fold a decided spec into one existing doc with surgical edits that read as its original author's. The decisions block is the source of truth for the round.

1. Read the target doc whole first: its structure, heading style, and voice.
2. Fold each decision into the right section (the section guide, when given, says which) with minimal edits; preserve all carry-forward content the decisions don't contradict.
3. A name the decisions leave open: search the doc set for the established one before writing it.
4. Describe the change itself; never introduce internal tooling or skill names into a committed doc.
5. Anything the decisions block leaves ambiguous goes in Flagged, never guessed.

Report sections: one line per touched section, `<section>: folded in X / preserved Y / flagged Z`; the def's shared tail.
