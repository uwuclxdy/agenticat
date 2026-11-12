# Cargo: Conceptual Overview, Build Cache & Key Commands

Load when a build is slow or rebuilds for no reason, when writing `build.rs`, or for `Cargo.lock`, edition and diagnostics questions.
Profile settings: `profiles.md`. `.cargo/config.toml` keys: `config.md`.

> _Captured 2026-06-28 (Rust/Cargo stable), audited against the Rust/Cargo 1.99 docs. Sources, under https://doc.rust-lang.org/cargo/: `guide/`, `reference/build-cache.html`, `reference/build-scripts.html`, `reference/timings.html`, `commands/cargo-tree.html`._

## Build Pipeline

`cargo build` runs five stages: parse manifests, resolve the dep graph (write/read `Cargo.lock`), fetch missing crates, compile each unit in dependency order (`build.rs` runs before its package), link. Cargo compiles independent crates in parallel; the real bottleneck is the critical path, the longest chain of sequential deps. See `--timings` below.

Resolution picks the highest version satisfying every constraint in the graph. Constraint syntax: `references/dependencies.md`; resolver versions and feature unification: `references/workspaces.md`.

## Cargo.toml vs Cargo.lock

`Cargo.toml` is your hand-written intent (flexible version constraints); `Cargo.lock` is Cargo's exact resolved pins. Edit the lock via `cargo update`, never by hand.

### When to Commit Cargo.lock

Commit `Cargo.lock`: always for a binary, application or workspace with binaries, and by default for a library too (the choice follows the package's needs, not binary-vs-library). A library's lock pins only its own dev/CI runs; a dependent's own resolution governs what it builds. Never gitignore it by reflex. CI should still test against the latest dependency versions.

In CI build with `--locked`: without it a changed requirement silently rewrites the lock; with it a missing or stale lock is an error. `--frozen` = `--locked` + `--offline`: only for jobs that never download a crate.

```bash
# wrong: Cargo.lock in .gitignore; a hand-edited lock entry; plain `cargo build` in CI
# right
git add Cargo.lock
cargo build --locked
```

## target/ Directory + Build Cache

### Directory Layout

```
target/
  debug/              # dev, test and the built-in debug profile
  release/            # release + bench profiles
  <custom-profile>/   # --profile=foo
  doc/                # rustdoc output
  package/            # cargo package output
  cargo-timings/      # --timings HTML reports

  # Cross-compilation (--target <triple>)
  <triple>/debug/
  <triple>/release/

# Internal (build-dir) layout
<build-dir>/debug/
  deps/               # compiled dependency artifacts (.rlib, .rmeta)
  incremental/        # rustc incremental compilation cache
  build/              # build script outputs (OUT_DIR per package)
```

### Cache Invalidation Triggers

Cargo rebuilds a crate when any of these change: its `.rs` sources, `Cargo.toml` metadata affecting compilation, `RUSTFLAGS` or other env vars that affect compilation, the compiler version (`rustc --version`), enabled features, profile settings, build script outputs. Incremental compilation (`incremental/`) further caches inside a single crate recompilation.

Move the directory with `CARGO_TARGET_DIR`, `build.target-dir` or `--target-dir`; `build.build-dir` (`CARGO_BUILD_BUILD_DIR`) separates intermediate from final artifacts. Details: `config.md`.

`sccache` (`RUSTC_WRAPPER` / `build.rustc-wrapper`) caches compiled artifacts by input hash and shares them across projects and CI runs. Setup plus backends: `config.md`.

### cargo clean

`cargo clean` removes the entire `target/` directory; `cargo clean -p mycrate` only the artifacts for `mycrate`. The next build starts cold: do it only when diagnosing cache corruption or after major toolchain changes. Debug an unexpected rebuild with `CARGO_LOG=cargo::compiler::fingerprint=info cargo build`.

## Key Commands (Build + Diagnostics)

### Core Build Commands

| Command | Notes |
|---|---|
| `cargo check` | Type-check only, no codegen; fastest feedback loop, produces no binary; misses diagnostics that only appear during code generation |
| `cargo bench` | Profile `bench` (inherits `release`); needs `#[bench]` (nightly) or criterion |

### Updating

```bash
cargo update                    # re-resolve all deps, stay inside semver bounds
cargo update -p regex           # only `regex` moves; its deps update only when it cannot move without them
cargo update -p regex --precise 1.2.3   # force `regex` to an exact version
```

### Build + Size Diagnostics: Measure First

#### 1. cargo build --timings (Compile-Time Profiling)

```bash
cargo build --timings
# Output: target/cargo-timings/cargo-timing.html
```

What the report shows:
- Unit graph: timeline of each crate compilation; dependency edges show what unblocks what
- Concurrency graph: units Active (green) / Waiting for a CPU slot (red) / Inactive = waiting for deps (blue)
- Summary table: per-unit total time + codegen time + enabled features; timestamped copies kept

Use it to find crates on the critical path (a lone sequential bottleneck is the best parallelism gain), crates built multiple times at different versions, and crates with expensive but unused features enabled.

#### 2. cargo tree (Dependency Graph Inspection)

```bash
cargo tree                  # full dep tree
cargo tree -d               # show copies built more than once (versions or features)
cargo tree -i <crate>       # invert: what depends on <crate> (add --workspace: the default covers one member)
cargo tree -e features      # show which features are enabled per dep
cargo tree -e features -i syn   # why is `syn` pulling in feature X?
cargo tree --depth 2        # limit display depth
```

**`-d` / `--duplicates`** surfaces crates compiled twice (e.g., `rand 0.7` + `rand 0.8`). Each adds compile time and, if linked, binary size; a copy at another version has types that do not match.

Fix: align the requirements (`[workspace.dependencies]`) or `cargo update -p <crate>@<old> --precise <version>`. `[patch]` cannot merge them: it swaps a crate's source, not what dependents require.

#### 3. cargo-bloat (Binary Size Analysis)

Third-party tool (`cargo install cargo-bloat`):

```bash
cargo bloat --release               # show functions by size
cargo bloat --release --crates      # show size contribution per crate
```

Shows which crate or function (generics monomorphization) dominates the binary, and whether a dep's features pull in unused heavy code.

## Build Scripts (build.rs)

A `build.rs` file at the package root is compiled and run ahead of the package itself.

```rust
// does not compile
fn main() {
    let out_dir = env!("OUT_DIR");                 // set when build.rs RUNS, not at compile time
    if cfg!(target_os = "windows") {               // the HOST's OS
        println!("cargo:rustc-link-lib=userenv");  // legacy single colon
    }
    std::fs::write("src/hello.rs", "").unwrap();   // outside OUT_DIR
}
```

```rust
use std::{env, fs, path::Path};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("cargo::rerun-if-changed=src/native/lib.c");
    let out_dir = env::var("OUT_DIR")?;
    if env::var("CARGO_CFG_TARGET_OS")? == "windows" {
        println!("cargo::rustc-link-lib=userenv");
    }
    fs::write(Path::new(&out_dir).join("hello.rs"), "pub fn message() -> &'static str { \"Hi\" }")?;
    Ok(())
}
```

- Cargo's variables (`OUT_DIR`, `TARGET`) exist only when the script runs: read them with `std::env::var`, never `env!`.
- Branch on the `CARGO_CFG_*` variables, never on `cfg!` / `#[cfg]`.
- Write only inside `OUT_DIR`, and overwrite fully: Cargo never empties it between builds. Pull the file into the crate with `include!(concat!(env!("OUT_DIR"), "/hello.rs"));`, never `mod hello;`.
- `cargo::KEY=VALUE` needs Rust 1.77+; `cargo:KEY=VALUE` is the legacy form, kept only for an older MSRV.
- Print `rerun-if-changed` for every input file and `rerun-if-env-changed` for every user variable read (`CC`). With none, Cargo re-runs the script whenever any file in the package changes: a common cause of slow incremental builds. Print `rerun-if-changed=build.rs` only when there is no other input.
- Build C/C++ through the `cc`, `pkg-config`, `bindgen` or `cmake` crates, never a hand-rolled `Command::new("gcc")`.
- Emit `rustc-link-search` before the `rustc-link-lib` that needs it: instruction order becomes linker-argument order.
- `rustc-cfg` never turns on a Cargo feature or an optional dependency: declare those in `[features]`.
- Native library: one `foo-sys` crate with `links = "foo"` in `[package]` and a build script (`links` without one does not build). One package per `links` value in the whole graph.

### Key Stdout Instructions

Build scripts compile C/C++, link system libraries and generate code. Cargo reads their stdout for these directives:

| Instruction | Effect |
|---|---|
| `cargo::rustc-link-lib=LIB` | Link native lib |
| `cargo::rustc-link-search=PATH` | Add linker search path |
| `cargo::rustc-cfg=KEY[="VALUE"]` | Set compile-time cfg |
| `cargo::rustc-check-cfg=cfg(KEY)` | Declare that cfg (Cargo 1.80+); without it `unexpected_cfgs` warns |
| `cargo::rustc-env=VAR=VALUE` | Set env var for compilation; the crate reads it with `env!("VAR")` |
| `cargo::rerun-if-changed=PATH` | Only re-run if PATH changes |
| `cargo::rerun-if-env-changed=NAME` | Only re-run if env var changes |
| `cargo::metadata=KEY=VALUE` | From a `links = "foo"` crate (1.77+): build scripts of direct dependents read `DEP_FOO_KEY` |

### Build Dependencies

```toml
[build-dependencies]
cc = "1.0"   # wrong: under [dependencies], where build.rs cannot see it
```

Build scripts can ONLY access `[build-dependencies]`, not `[dependencies]` or `[dev-dependencies]`.

## Editions

```toml
[package]
edition = "2024"   # 2015 | 2018 | 2021 | 2024; wrong: no `edition` key (= 2015)
```

2015 is the default if the field is omitted (backwards compat); 2021 made resolver v2 the default; 2024 is the latest and the `cargo new` default.

- Editions are set per-package, not per-workspace; mixed editions in one workspace are fine
- Editions never break dependency compatibility; a 2015 crate can depend on a 2024 crate
- Migrate in order: run `cargo fix --edition` on the old edition, then bump `edition`, then build and test
- Edition affects all targets in the package (bins, tests, benches, examples); never set `edition` inside a target table (deprecated)

## Checklist

- [ ] `Cargo.lock` is committed and CI builds with `--locked`.
- [ ] `[package]` sets `edition`.
- [ ] `build.rs`: `std::env::var` for `OUT_DIR` and `CARGO_CFG_*`, output only under `OUT_DIR`, `rerun-if` lines printed.
- [ ] Its crates are under `[build-dependencies]`; every `rustc-cfg` has a `rustc-check-cfg`.
- [ ] A slowdown was measured (`--timings`, `cargo tree -d`) before any change.
