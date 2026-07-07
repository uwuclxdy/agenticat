# Trimming unused, duplicate & heavy dependencies
> _Captured 2026-06-28 (Rust/Cargo stable). To update: re-fetch the source URL(s) below, then diff for changes._

> Cutting dead and duplicate deps is the most direct way to shrink a `Cargo.toml`'s compile time and
> binary size. Built-in `cargo tree` finds duplicates; external tools find unused and risky deps.

## Find duplicate versions (built-in, no install)

```bash
cargo tree -d           # crates compiled at 2+ semver-incompatible versions
cargo tree -i <crate>   # what pulls a crate in
```

Each duplicate adds compile time plus binary size and can cause type-mismatch errors across crate
boundaries. Collapse them by aligning version requirements, or with `[patch]` / `[workspace.dependencies]`
at the workspace root.

### Collapse a duplicate by pinning to the transitive major

When one copy is your own direct dep and the other arrives transitively (you request `reqwest = "0.13"`
while `lancedb` pulls `0.12`), pin your requirement back to the transitive crate's major so both unify.
Confirm the dup is collapsible first:

```bash
cargo metadata --format-version 1   # inspect each requirer's `req` + `optional` flag
```

Collapsible when every *active* requirer already shares one major. Any requirer of the *other* major must
be `optional = true` and left dormant by your feature set; a non-optional one forces a `[patch]` instead.

**The collapse survives `cargo update`.** Update re-resolves inside existing `^` ranges without flipping
optional deps on, so it never crosses the `0.12 → 0.13` boundary by itself. The dup returns only when you
*manually* bump the transitive dep to a new major that moved, or enable a feature that wakes a dormant
`optional` requirer of the other major. `cargo tree -d` flags either case immediately, so a one-line
requirement realign fixes it. Guard the specific crate in CI:

```bash
cargo tree -d -e normal | grep -q '^<crate> v' && { echo "<crate> split into two majors"; exit 1; }
```

## Find unused dependencies

### cargo-machete (fast, heuristic)

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

### cargo-udeps (precise, needs nightly)

```bash
cargo install cargo-udeps
cargo +nightly udeps --all-targets
```

- Uses real compilation data, so fewer false-positives than machete.
- Slower (full check build) plus nightly-only.

Run machete in CI for speed; reach for udeps when machete's result looks wrong.

## Audit + ban (cargo-deny)

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

## Keeping versions current

```bash
cargo update                 # re-resolve inside existing semver bounds
cargo install cargo-edit     # adds the `cargo upgrade` subcommand
cargo upgrade --dry-run      # bump the version requirements themselves in Cargo.toml
```

## Official sources

- cargo-tree: <https://doc.rust-lang.org/cargo/commands/cargo-tree.html>
- cargo-machete: <https://github.com/bnjbvr/cargo-machete>
- cargo-udeps: <https://github.com/est31/cargo-udeps>
- cargo-deny: <https://embarkstudios.github.io/cargo-deny/>
- cargo-edit: <https://github.com/killercup/cargo-edit>
