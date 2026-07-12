# cargo: Conceptual Overview, Build Cache & Key Commands
> _Captured 2026-06-28 (Rust/Cargo stable). To update: re-fetch the source URL(s) below, then diff for changes._

> Sources: [Cargo Guide](https://doc.rust-lang.org/cargo/guide/), [Build Cache Reference](https://doc.rust-lang.org/cargo/reference/build-cache.html), [Build Scripts Reference](https://doc.rust-lang.org/cargo/reference/build-scripts.html), [cargo-tree](https://doc.rust-lang.org/cargo/commands/cargo-tree.html), [Timings Reference](https://doc.rust-lang.org/cargo/reference/timings.html)

---

## Build Pipeline

`cargo build` runs five stages: parse manifests, resolve the dep graph (write/read `Cargo.lock`), fetch
missing crates, compile each unit in dependency order (`build.rs` runs before its package), link. Cargo
compiles independent crates in parallel; the real bottleneck is the critical path, the longest chain of
sequential deps. See `--timings` below.

---

## Cargo.toml vs Cargo.lock

Source: [Cargo.toml vs Cargo.lock](https://doc.rust-lang.org/cargo/guide/cargo-toml-vs-cargo-lock.html)

`Cargo.toml` is your hand-written intent (flexible version constraints); `Cargo.lock` is Cargo's exact
resolved pins. Edit the lock via `cargo update`, never by hand.

### When to Commit Cargo.lock

Guidance changed 2023-08: the old "libraries don't commit `Cargo.lock`" convention is superseded.
Whether to commit it now depends on the package's own needs, not on binary-vs-library — committing it
is a reasonable default/starting point even for a library (a dependent's own resolution still governs
what it builds; the committed lock only pins your own dev/CI runs). Regardless of the choice, CI should
regularly test against the latest dependency versions.

| Project type | Commit Cargo.lock? | Reason |
|---|---|---|
| **Binary / application** | **Yes** | Reproducible deployments; deterministic CI |
| **Library (published crate)** | Either; committing is a reasonable default | A dependent's own resolution still governs its build; test against latest deps in CI either way |
| **Workspace with binaries** | **Yes** | Same as binary |

Source: [Change in Guidance on Committing Lockfiles](https://blog.rust-lang.org/2023/08/29/committing-lockfiles/) (2023-08-29); current wording in the [Cargo FAQ](https://doc.rust-lang.org/cargo/faq.html).

---

## target/ Directory + Build Cache

Source: [Build Cache Reference](https://doc.rust-lang.org/cargo/reference/build-cache.html)

### Directory Layout

```
target/
  debug/              # dev + test profiles
  release/            # release + bench profiles
  <custom-profile>/   # --profile=foo
  doc/                # rustdoc output
  package/            # cargo package output
  cargo-timings/      # --timings HTML reports

  # Cross-compilation (--target <triple>)
  <triple>/debug/
  <triple>/release/
```

### Internal (build-dir) Layout

```
<build-dir>/debug/
  deps/               # compiled dependency artifacts (.rlib, .rmeta)
  incremental/        # rustc incremental compilation cache
  build/              # build script outputs (OUT_DIR per package)
```

### Cache Invalidation Triggers

Cargo rebuilds a crate when any of these change:
- source files (`.rs`) of that crate
- `Cargo.toml` metadata affecting compilation
- `RUSTFLAGS` or other env vars that affect compilation
- compiler version (`rustc --version`)
- enabled features
- profile settings
- build script outputs (if `rerun-if-changed` conditions are met)

Incremental compilation (`incremental/`) further caches inside a single crate recompilation.

### Configuration

| Method | Key |
|---|---|
| `CARGO_TARGET_DIR` env var | Override target directory |
| `build.target-dir` in `.cargo/config.toml` | Project/workspace-level override |
| `--target-dir` CLI flag | Per-invocation override |
| `CARGO_BUILD_BUILD_DIR` / `build.build-dir` | Separate intermediate artifacts from final artifacts |

### Sharing Cache Between Workspaces

`sccache` (`RUSTC_WRAPPER` / `build.rustc-wrapper`) caches compiled artifacts by input hash and shares
them across projects and CI runs. Setup plus backends: `config.md`.

### cargo clean

```bash
cargo clean             # remove entire target/ directory
cargo clean -p mycrate  # remove only artifacts for `mycrate`
```

Cost: next build starts cold. Only do this when diagnosing cache corruption or after major toolchain changes.

---

## Key Commands (Build + Diagnostics)

### Core Build Commands

The non-obvious ones (`build`/`build --release`/`run`/`test`/`doc`/`update`/`clean` do what their names say):

| Command | Notes |
|---|---|
| `cargo check` | Type-check only, no codegen; fastest feedback loop, produces no binary |
| `cargo bench` | Uses the **release** profile; needs `#[bench]` (nightly) or criterion |

### Updating

```bash
cargo update                    # re-resolve all deps, stay inside semver bounds
cargo update -p regex           # re-resolve only `regex` (+ its deps)
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
- Concurrency graph: Active (green) / Waiting (red) / Blocked-on-deps (blue) slots over time
- Summary table: per-unit total time + codegen time + enabled features
- Timestamped copies kept for comparing before/after

Diagnose with it:
- Find crates on the critical path (lone sequential bottleneck = best parallelism gain)
- Spot crates built multiple times at different versions
- Identify crates with expensive but unused features enabled

#### 2. cargo tree (Dependency Graph Inspection)

```bash
cargo tree                  # full dep tree
cargo tree -d               # show ONLY duplicate versions (different semver-incompatible copies)
cargo tree -i <crate>       # invert: show what depends on <crate>
cargo tree -e features      # show which features are enabled per dep
cargo tree -e features -i syn   # why is `syn` pulling in feature X?
cargo tree --depth 2        # limit display depth
```

**`-d` / `--duplicates`** surfaces crates compiled twice (e.g., `rand 0.7` + `rand 0.8`). Each duplicate:
- adds compile time
- bloats binary size
- can cause type incompatibility between crate boundaries

Fix: align dep versions in `Cargo.toml`, or use `[patch]` in workspace root.

#### 3. cargo-bloat (Binary Size Analysis)

Third-party tool, not in stdlib:

```bash
cargo install cargo-bloat
cargo bloat --release               # show functions by size
cargo bloat --release --crates      # show size contribution per crate
cargo bloat --release -n 10         # top 10 largest symbols
```

Diagnose with it:
- Which crate contributes most to binary size
- Which functions are unexpectedly large (generics monomorphization)
- Whether a dep's features include unused heavy code

#### 4. Nightly Self-Profiling

```bash
cargo +nightly rustc -- -Z self-profile  # rustc-level profiling (measureme output)
```

Self-profile output needs `measureme`'s `summarize` or `crox` tools to analyze. Use for diagnosing rustc internals (macro expansion, type checking, LLVM codegen).

---

## Build Scripts (build.rs)

Source: [Build Scripts Reference](https://doc.rust-lang.org/cargo/reference/build-scripts.html)

A `build.rs` file at the package root is compiled and run ahead of the package itself.

### Key stdout Instructions

Build scripts compile native C/C++ libs (via the `cc` crate), link system libraries, run code generation
(proto, parsers), and detect the target triple. Cargo reads their stdout for these directives:

| Instruction | Effect |
|---|---|
| `cargo::rustc-link-lib=LIB` | Link native lib |
| `cargo::rustc-link-search=PATH` | Add linker search path |
| `cargo::rustc-cfg=KEY[="VALUE"]` | Set compile-time cfg |
| `cargo::rustc-env=VAR=VALUE` | Set env var for compilation |
| `cargo::rerun-if-changed=PATH` | Only re-run if PATH changes |
| `cargo::rerun-if-env-changed=NAME` | Only re-run if env var changes |

### Build Dependencies

```toml
[build-dependencies]
cc = "1.0"
```

Build scripts can ONLY access `[build-dependencies]`, not `[dependencies]` or `[dev-dependencies]`.

### Performance Relevance

By default, Cargo re-runs `build.rs` on any package file change. Add `rerun-if-changed` triggers to avoid unnecessary re-runs:

```rust
fn main() {
    println!("cargo::rerun-if-changed=build.rs");
    println!("cargo::rerun-if-changed=src/native/lib.c");
}
```

Missing these = build script runs on every `cargo build`, even when nothing relevant changed. This is a common source of slow incremental builds.

---

## Editions

Source: [edition field reference](https://doc.rust-lang.org/cargo/reference/manifest.html#the-edition-field)

```toml
[package]
edition = "2024"   # 2015 | 2018 | 2021 | 2024
```

| Edition | Status | Notes |
|---|---|---|
| 2015 | Legacy | Default if field omitted; backwards compat |
| 2018 | Stable | Module system overhaul, `async`/`await` prep |
| 2021 | Stable | Closure capture improvements, resolver v2 default |
| 2024 | Latest | Default for `cargo new`; edition-specific syntax changes |

Key points:
- Editions are set per-package, not per-workspace; mixed editions in one workspace are fine
- Editions never break dependency compatibility; a 2015 crate can depend on a 2024 crate
- `cargo fix --edition` automates most migration steps
- Edition affects all targets in the package (bins, tests, benches, examples)
