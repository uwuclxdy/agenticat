# Trimming Unused, Duplicate & Heavy Dependencies

Load when removing unused or duplicate dependencies, or wiring a `cargo deny` audit.
`cargo tree` finds duplicates; external tools find unused and risky deps.

> _Captured 2026-06-28 (Rust/Cargo stable). To update: re-fetch the source URL(s) below, then diff for changes._

> Sources: https://github.com/bnjbvr/cargo-machete, https://github.com/est31/cargo-udeps, https://embarkstudios.github.io/cargo-deny/, https://github.com/killercup/cargo-edit

## Find Duplicate Versions (Built-in, No Install)

```bash
cargo tree -d           # a crate built at 2+ versions, or one version twice (features, sources)
cargo tree -i <crate>   # what pulls a crate in
```

Each duplicate costs compile time and binary size; sometimes it trips type-mismatch errors at a crate boundary too. Collapse them by aligning version requirements and feature lists. Neither `[patch]` nor `[workspace.dependencies]` unifies incompatible majors.

### Collapse a Duplicate by Pinning to the Transitive Major

When one copy is your own direct dep and the other arrives transitively at an older major, pin your requirement back to that major so both unify: you ask for `foo = "0.13"`, a dependency pulls `foo 0.12`, so you request `"0.12"` and the graph resolves to one copy. Collapsible only when every active requirer already shares one major. `[patch]` can't rescue the case where it doesn't: a patch only applies when its version satisfies the existing requirement's semver range, so a non-optional requirer stuck on the other major still resolves to its own separate copy. Real options at that point: get the requirer updated to the new major, fork/patch the requirer itself, or accept the duplicate. Confirm with `cargo metadata --format-version 1` (inspect each requirer's `req` + `optional` flag).

The collapse survives `cargo update` (it stays inside existing `^` ranges) and returns only when a transitive dep bumps majors or a feature flip wakes a dormant optional requirer. `cargo tree -d` catches either case.

## Find Unused Dependencies

### cargo-machete (Fast, Heuristic)

```bash
cargo install cargo-machete
cargo machete
cargo machete --fix      # strip the unused entries
```

- Pure source scan, fast, no compile step.
- False-positives on deps used only through macros or re-exports. Suppress per-crate:

```toml
[package.metadata.cargo-machete]
ignored = ["winapi"]
```

### cargo-udeps (Precise, Needs Nightly)

```bash
cargo install cargo-udeps
cargo +nightly udeps --all-targets
```

Uses real compilation data, so fewer false-positives than machete. Slower (full check build) plus nightly-only.

Run machete in CI for speed; reach for udeps when machete's result looks wrong.

## Audit + Ban (cargo-deny)

```bash
cargo install --locked cargo-deny
cargo deny init          # writes deny.toml
cargo deny check
```

Four independent checks in `deny.toml`:

| Check | Catches | Config trap |
|---|---|---|
| `advisories` | RUSTSEC security advisories, yanked crates, unmaintained crates | |
| `bans` | duplicate versions, banned crates, wildcard deps, heavy deps you forbid | nothing banned until `deny = ["crate"]`; a non-empty `allow` denies all unlisted crates: add `allow-workspace = true` to keep members allowed |
| `licenses` | disallowed or unknown SPDX licenses anywhere in the graph | any license not in `allow` is denied; entries are SPDX ids, not names |
| `sources` | crates from unapproved registries or git hosts | `unknown-git`/`unknown-registry` warn until set to `"deny"` |

`bans` doubles as a dedupe guard: set `multiple-versions = "deny"` (default `"warn"`) to fail CI when a crate resolves to more than one version; dev-only duplicates need `multiple-versions-include-dev = true`.

To make CI red on a member that re-declares a shared dependency instead of inheriting it, add the opt-in table `[bans.workspace-dependencies]` (`duplicates` and `unused` both default to `deny` once it exists).

## Keeping Versions Current

```bash
cargo update                 # re-resolve inside existing semver bounds
cargo install cargo-edit     # adds the `cargo upgrade` subcommand
cargo upgrade --dry-run      # bump the version requirements themselves in Cargo.toml
```

## Checklist

Run over your own diff:

- [ ] `cargo tree -d` re-run; every remaining duplicate has a known cause.
- [ ] A machete hit is checked for macro or re-export use before removal.
- [ ] `deny.toml` says `"deny"` where CI must fail; CI runs `cargo deny --locked check`.
