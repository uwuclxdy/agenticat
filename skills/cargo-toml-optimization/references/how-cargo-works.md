# cargo: conceptual overview, build cache & key commands
> _Captured 2026-06-28 (Rust/Cargo stable). To update: re-fetch the source URL(s) below, then diff for changes._

> Sources: [Cargo Guide](https://doc.rust-lang.org/cargo/guide/), [Build Cache Reference](https://doc.rust-lang.org/cargo/reference/build-cache.html), [Build Scripts Reference](https://doc.rust-lang.org/cargo/reference/build-scripts.html), [cargo-tree](https://doc.rust-lang.org/cargo/commands/cargo-tree.html), [Timings Reference](https://doc.rust-lang.org/cargo/reference/timings.html)

---

## What Cargo Is

Cargo is Rust's official package manager and build tool. It solves:
- manual `rustc` invocation complexity as deps grow
- dependency fetching + transitive resolution
- reproducible builds on any machine and in CI
- standardized project conventions (`cargo build` works everywhere)

> "Once you know how to build one Cargo-based project, you know how to build all of them."
> ([Why Cargo Exists](https://doc.rust-lang.org/cargo/guide/why-cargo-exists.html))

---

## Build Pipeline

Cargo's conceptual stages on `cargo build`:

| Stage | What happens |
|---|---|
| **Parse** | Read `Cargo.toml` manifest(s); validate structure |
| **Resolve** | Compute dependency graph satisfying all version constraints; write/read `Cargo.lock` |
| **Fetch** | Download missing crates from registry (crates.io) or git sources into `~/.cargo/registry` / `~/.cargo/git` |
| **Compile** | Invoke `rustc` for each unit in dependency order; run `build.rs` scripts before their package |
| **Link** | Combine compiled artifacts; produce final binary/lib in `target/<profile>/` |

Cargo maximises parallelism by compiling independent crates concurrently. The critical path (longest chain of sequential deps) is the main build-time bottleneck; see `--timings` below.

---

## Cargo.toml vs Cargo.lock

Source: [Cargo.toml vs Cargo.lock](https://doc.rust-lang.org/cargo/guide/cargo-toml-vs-cargo-lock.html)

| | `Cargo.toml` | `Cargo.lock` |
|---|---|---|
| **Author** | You (human-written) | Cargo (auto-generated) |
| **Purpose** | Declares intent: what deps + version constraints | Records exact resolved versions + hashes |
| **Version spec** | Flexible (`"^1.0"`, `">=0.5, <1.0"`) | Pinned (`1.5.3`, commit SHA) |
| **Manual edit?** | Yes | No; run `cargo update` instead |

### When to commit Cargo.lock

| Project type | Commit Cargo.lock? | Reason |
|---|---|---|
| **Binary / application** | **Yes** | Reproducible deployments; deterministic CI |
| **Library (published crate)** | Convention says no (but not wrong to) | Downstream controls resolution; lock would be ignored anyway by dependents |
| **Workspace with binaries** | **Yes** | Same as binary |

### SemVer Resolution

- `"1.2.3"` → shorthand for `"^1.2.3"` → `>=1.2.3, <2.0.0`
- `"0.1.12"` → `>=0.1.12, <0.2.0` (pre-1.0: minor is breaking)
- Cargo picks the highest version satisfying all constraints in the graph
- Two semver-incompatible versions of the same crate CAN coexist in the graph (e.g., `rand 0.7` + `rand 0.8`), bloating binaries and slowing builds

### Updating

```bash
cargo update            # re-resolve all, staying inside semver bounds
cargo update regex      # update only the `regex` package
```

---

## target/ Directory + Build Cache

Source: [Build Cache Reference](https://doc.rust-lang.org/cargo/reference/build-cache.html)

### Directory layout

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

### Internal (build-dir) layout

```
<build-dir>/debug/
  deps/               # compiled dependency artifacts (.rlib, .rmeta)
  incremental/        # rustc incremental compilation cache
  build/              # build script outputs (OUT_DIR per package)
```

### Cache invalidation triggers

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

### Sharing cache between workspaces

sccache shares compiled artifacts between projects; configure it via:

```bash
cargo install sccache
export RUSTC_WRAPPER=sccache
# or in .cargo/config.toml:
# [build]
# rustc-wrapper = "sccache"
```

sccache caches based on inputs; hits skip recompilation entirely. CI benefits most since each run starts cold.

### cargo clean

```bash
cargo clean             # remove entire target/ directory
cargo clean -p mycrate  # remove only artifacts for `mycrate`
```

Cost: next build starts cold. Only do this when diagnosing cache corruption or after major toolchain changes.

---

## Key Commands (Build + Diagnostics)

### Core build commands

| Command | Purpose | Notes |
|---|---|---|
| `cargo build` | Debug build | `target/debug/`, unoptimized, fast compile |
| `cargo build --release` | Release build | `target/release/`, optimized (`opt-level=3`), slow compile |
| `cargo check` | Type-check only, no codegen | Fastest feedback loop; no binary produced |
| `cargo run` | Build + run binary | Accepts `-- <args>` for program args |
| `cargo test` | Build + run tests | Compiles test binary with `#[test]` runner |
| `cargo bench` | Build + run benchmarks | Requires `#[bench]` or criterion; uses release profile |
| `cargo doc` | Generate rustdoc HTML | Output in `target/doc/` |
| `cargo update` | Re-resolve deps inside semver constraints | Updates `Cargo.lock` |
| `cargo clean` | Delete target/ artifacts | Forces cold rebuild |

### Build + size diagnostics: measure first

#### 1. cargo build --timings (compile-time profiling)

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
- Find crates on the **critical path** (lone sequential bottleneck = best parallelism gain)
- Spot crates built **multiple times** at different versions
- Identify crates with expensive but unused features enabled

#### 2. cargo tree (dependency graph inspection)

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

#### 3. cargo-bloat (binary size analysis)

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

#### 4. Nightly self-profiling

```bash
cargo +nightly build -Z timings       # same as --timings but nightly-gated extended version
cargo +nightly rustc -- -Z self-profile  # rustc-level profiling (measureme output)
```

Self-profile output needs `measureme`'s `summarize` or `crox` tools to analyze. Use for diagnosing rustc internals (macro expansion, type checking, LLVM codegen).

---

## Build Scripts (build.rs)

Source: [Build Scripts Reference](https://doc.rust-lang.org/cargo/reference/build-scripts.html)

A `build.rs` file at the package root is compiled and run **before** the package itself.

### What they do

- Compile C/C++ native libraries (via `cc` crate)
- Link system libraries (`cargo::rustc-link-lib=openssl`)
- Code generation (proto, parsers)
- OS/target-triple detection

### Key stdout instructions

| Instruction | Effect |
|---|---|
| `cargo::rustc-link-lib=LIB` | Link native lib |
| `cargo::rustc-link-search=PATH` | Add linker search path |
| `cargo::rustc-cfg=KEY[="VALUE"]` | Set compile-time cfg |
| `cargo::rustc-env=VAR=VALUE` | Set env var for compilation |
| `cargo::rerun-if-changed=PATH` | Only re-run if PATH changes |
| `cargo::rerun-if-env-changed=NAME` | Only re-run if env var changes |

### Build dependencies

```toml
[build-dependencies]
cc = "1.0"
```

Build scripts can ONLY access `[build-dependencies]`, not `[dependencies]` or `[dev-dependencies]`.

### Performance relevance

By default, Cargo re-runs `build.rs` on any package file change. **Always add `rerun-if-changed` triggers** to avoid unnecessary re-runs:

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
- Editions are **per-package**, not per-workspace; mixed editions in one workspace are fine
- Editions never break dependency compatibility; a 2015 crate can depend on a 2024 crate
- `cargo fix --edition` automates most migration steps
- Edition affects all targets in the package (bins, tests, benches, examples)
