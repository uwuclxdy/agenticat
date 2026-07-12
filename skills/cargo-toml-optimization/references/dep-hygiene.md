# Trimming Unused, Duplicate & Heavy Dependencies
> _Captured 2026-06-28 (Rust/Cargo stable). To update: re-fetch the source URL(s) below, then diff for changes._

> Cutting dead and duplicate deps is the most direct way to shrink a `Cargo.toml`'s compile time and
> binary size. Built-in `cargo tree` finds duplicates; external tools find unused and risky deps.

## Find Duplicate Versions (Built-in, No Install)

```bash
cargo tree -d           # crates compiled at 2+ semver-incompatible versions
cargo tree -i <crate>   # what pulls a crate in
```

Each duplicate costs compile time and binary size; sometimes it trips type-mismatch errors at a crate
boundary too. Collapse them by aligning version requirements, or with `[patch]` / `[workspace.dependencies]`
at the workspace root.

### Collapse a Duplicate by Pinning to the Transitive Major

When one copy is your own direct dep and the other arrives transitively at an older major, pin your
requirement back to that major so both unify: you ask for `foo = "0.13"`, a dependency pulls `foo 0.12`,
so you request `"0.12"` and the graph resolves to one copy. Collapsible only when every active requirer
already shares one major. `[patch]` can't rescue the case where it doesn't: a patch only applies when
its version satisfies the existing requirement's semver range, so a non-optional requirer stuck on the
other major still resolves to its own separate copy. Real options at that point: get the requirer
updated to the new major, fork/patch the requirer itself, or accept the duplicate. Confirm with:

```bash
cargo metadata --format-version 1   # inspect each requirer's `req` + `optional` flag
```

The collapse survives `cargo update` (it stays inside existing `^` ranges) and returns only when a
transitive dep bumps majors or a feature flip wakes a dormant optional requirer. `cargo tree -d`
catches either case.

## Find Unused Dependencies

### cargo-machete (Fast, Heuristic)

```bash
cargo install cargo-machete
cargo machete            # scans Cargo.toml + source for each crate's usage
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

- Uses real compilation data, so fewer false-positives than machete.
- Slower (full check build) plus nightly-only.

Run machete in CI for speed; reach for udeps when machete's result looks wrong.

## Audit + Ban (cargo-deny)

```bash
cargo install cargo-deny
cargo deny init          # writes deny.toml
cargo deny check         # advisories + bans + licenses + sources
```

Four independent checks, configured in `deny.toml`:

| Check | Catches |
|---|---|
| `advisories` | RUSTSEC security advisories, yanked crates, unmaintained crates |
| `bans` | duplicate versions, banned crates, wildcard deps, heavy deps you forbid |
| `licenses` | disallowed or unknown SPDX licenses anywhere in the graph |
| `sources` | crates from unapproved registries or git hosts |

`bans` doubles as a dedupe guard: set `multiple-versions = "deny"` to fail CI when a crate resolves to
more than one version.

## Keeping Versions Current

```bash
cargo update                 # re-resolve inside existing semver bounds
cargo install cargo-edit     # adds the `cargo upgrade` subcommand
cargo upgrade --dry-run      # bump the version requirements themselves in Cargo.toml
```

## Official Sources

- cargo-tree: <https://doc.rust-lang.org/cargo/commands/cargo-tree.html>
- cargo-machete: <https://github.com/bnjbvr/cargo-machete>
- cargo-udeps: <https://github.com/est31/cargo-udeps>
- cargo-deny: <https://embarkstudios.github.io/cargo-deny/>
- cargo-edit: <https://github.com/killercup/cargo-edit>
