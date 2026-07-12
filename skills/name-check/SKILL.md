---
name: name-check
description: "Suggest project/crate/plugin names and verify availability across registries (crates.io, npm, PyPI, AUR, GitHub, domains). Use before naming, renaming, or publishing anything."
metadata:
  author: uwuclxdy
  version: "1.0"
---

# Name Check

## Procedure

1. **Scope first** (before a rename or release). Establish from context (ask if unsure):
   - what the thing does, in one line
   - which registries matter: crates.io, AUR, PyPI, npm, GitHub, KDE store, domain... 
   Check only relevant registries depending on the project.
   - rename cost: unpublished (cheap, anything goes) vs already public (flag every rename consequence)
2. **Generate 10-30 candidates.** Brainstorm and balance three axes:
   - explicit: name states the function (`kate-markdown-preview` over `katdown`)
   - brandable: short, lowercase, occasionally punny (`flit`, `nook`, `perch`)
   - user-fit: closest to the user's stated direction
   Mark each candidate with which axis it leans toward. Reserve companion names too when relevant (`flit` + `flitd` + `flit-mcp`).
3. **Check availability in parallel.** Fan out searches (web + registry pages) per candidate:
   - exact match on each relevant registry
   - general web collision: existing project, product, or company with the same name in the same space
   - near-collisions worth flagging (one-letter-off popular project, trademark-adjacent)
4. **Report as a table** with these columns:

| candidate | <one column per relevant registry> | web collision | note |
|---|---|---|---|

   `free` / `taken (link)` / `near: <what>` per cell. End with one recommendation and why.

## Helper

`name-check.ts` (same dir as the skill, requires `bun`) runs the deterministic registry axis in one pass to spare you the manual fetching:

`bun name-check.ts <name> [<name>...] [--table] [--registry npm,crates,...] [--tld com,io]`

- compact JSON by default; `--table` for a quick scan, `--list` for registry ids.
- supports npm, PyPI, crates.io, RubyGems, Hackage, Go, Docker (library), Homebrew, AUR, NuGet, GitHub, plus domain availability (RDAP, DNS-confirmed on a 404).
- does not do web collision. still run that axis via WebSearch (same-space products, companies, trademarks) and fold both into the report table.
- registry read-only.

## Rules

- Never reserve, publish, or rename anything. This flow is report only; renames require user's call.
- "Free" claims must come from an actual lookup this session, not memory.
- If every candidate is taken, say so and generate a second batch instead of stretching a bad fit.
