---
name: name-check
description: Suggest project/crate/plugin names, check whether a name is taken, verify availability, etc.
---

# name-check

Generate name candidates and verify availability across registries before a rename or release.

## Procedure

1. **Scope first.** Establish from context (ask only if missing):
   - what the thing does, in one line
   - which registries matter: crates.io, AUR, PyPI, npm, GitHub, KDE store, domain — only the relevant ones
   - rename cost: unpublished (cheap, anything goes) vs already public (flag every rename consequence)
2. **Generate ~10 candidates.** Balance two axes:
   - *explicit*: name states the function (`kate-markdown-preview` over `katdown`)
   - *brandable*: short, lowercase, occasionally punny (`flit`, `nook`, `perch`)
   Mark each candidate with which axis it leans toward. Reserve companion names too when relevant (`flit` + `flitd` + `flit-mcp`).
3. **Check availability in parallel.** Fan out searches (web + registry pages) per candidate:
   - exact match on each relevant registry
   - general web collision: existing project, product, or company with the same name in the same space
   - near-collisions worth flagging (one-letter-off popular crate, trademark-adjacent)
4. **Report as a table:**

| candidate | crates.io | AUR | GitHub | web collision | note |
|---|---|---|---|---|---|

   `free` / `taken (link)` / `near: <what>` per cell. End with one recommendation and why.

## Rules

- Never reserve, publish, or rename anything from this skill — report only; renames go through the user.
- "Free" claims must come from an actual lookup this session, not memory.
- If every candidate is taken, say so and generate a second batch instead of stretching a bad fit.
