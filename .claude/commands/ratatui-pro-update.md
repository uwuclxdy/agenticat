---
description: Re-syncs the catalog's ratatui-patterns skill + ratatui-pro agent against a new ratatui release, or reports whether they're stale.
disable-model-invocation: true
---

# Ratatui Pro Update

Refreshes this repo's `skills/ratatui-patterns/` + `agents/ratatui-pro.md` after a ratatui
release. Run it whenever crates.io is ahead of the version pinned in ratatui-patterns's SKILL.md.

## Procedure

1. **Detect.**
   `curl -s -H 'User-Agent: ratatui-version-check' https://crates.io/api/v1/crates/ratatui` →
   `max_stable_version` (bare curl without User-Agent gets policy-blocked). Compare against the
   version at the top of `skills/ratatui-patterns/SKILL.md` and in `references/api-reference.md`'s header.
   Equal → report "current" and stop.
   Stale-check-only ask (e.g. "is ratatui-patterns stale?", not a full update) → still run step 2 to
   get the release count, then print `old → new (N releases)` and stop before step 3's patching.

2. **Gather the delta.** For each release between old and new:
   - `https://api.github.com/repos/ratatui/ratatui/releases?per_page=10`; tag format is
     `ratatui-vX.Y.Z`; sibling crates tag separately (`ratatui-widgets-v…`), read the umbrella
     tag's body.
   - `https://raw.githubusercontent.com/ratatui/ratatui/main/BREAKING-CHANGES.md`
   - `https://ratatui.rs/highlights/vXYZ/` (version digits, no dots, e.g. `v0302`)
   Patch releases are usually bug-fix only; minor releases carry new API + breaking changes.

3. **Patch the references** (diff-driven: edit the sections the changelog touches, don't
   regenerate wholesale):
   - `api-reference.md`: update changed signatures/types, add new items with their origin
     crate, update the feature-flag table and the version-specific-notes + cheat-sheet
     sections, bump the header version note. For anything the changelog leaves ambiguous,
     verify against source: `https://raw.githubusercontent.com/ratatui/ratatui/ratatui-vX.Y.Z/<crate>/src/<file>.rs`
     or spawn a reader subagent (sonnet) per module on a shallow clone of the tag. Never write
     a signature you have not seen in source or official docs.
   - `modernization-checklist.md`: new built-ins that replace hand-rolling → new rows (with
     hunt patterns where a grep can find offenders).
   - `limitations.md`: re-check every gap row against the delta; a gap that gained a built-in
     MOVES to the checklist (this is the whole point of the file). Note the release that
     closed it.
   - `patterns.md` / `testing.md`: only if the delta touches their content.

4. **Sweep for drift.** Grep old version strings + every changed public symbol across all of
   `skills/ratatui-patterns/`, `.claude/commands/ratatui-pro-update.md`, and `agents/ratatui-pro.md`;
   fix stale mentions.

5. **Verify.** Spot-check 5 random cheat-sheet rows against docs.rs for the new version. If a
   sandbox repo is handy, `cargo add ratatui@<new>` + compile one snippet per NEW api-reference
   claim. Report what was verified vs taken from changelog only.

6. **Optionally re-audit** the fleet: `ratatui-patterns/references/audit-prompt.md` has the
   per-repo fan-out prompt; worth rerunning after a minor release (new built-ins = new
   punch-list rows), skip for patches.

## Output

Report: old → new version, delta summary (features / breaking / fixes), files edited, rows
moved from limitations → checklist, drift-sweep hits fixed, what remains unverified.

Stale-check-only request: report is just `old → new (N releases)`, then stop. No files touched.
