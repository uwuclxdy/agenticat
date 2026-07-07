# crates.io Cargo.toml Metadata Reference
> _Captured 2026-06-28 (Rust/Cargo stable). To update: re-fetch the source URL(s) below, then diff for changes._

## Source (for future changes)

- https://crates.io/category_slugs (authoritative slug list, rendered from categories.toml)
- https://doc.rust-lang.org/cargo/reference/manifest.html (Cargo manifest field rules)

The canonical source-of-truth for categories is:
https://github.com/rust-lang/crates.io/blob/main/src/boot/categories.toml

---

## Valid crates.io categories

All slugs below are sourced from `src/boot/categories.toml` in the rust-lang/crates.io repository. Use the exact `slug` string in `Cargo.toml`. Nested slugs use `::` as separator (e.g. `development-tools::testing`).

### Top-level categories

| slug | human name | description |
|------|-----------|-------------|
| `accessibility` | Accessibility | Assistive technology that helps overcome disabilities to make software usable by as many people as possible |
| `aerospace` | Aerospace | Crates for aeronautics (within atmosphere) and astronautics (in outer space) applications |
| `algorithms` | Algorithms | Rust implementations of core algorithms such as hashing, sorting, searching |
| `api-bindings` | API bindings | Idiomatic wrappers of specific APIs for convenient access from Rust, including HTTP API wrappers |
| `artificial-intelligence` | Artificial intelligence | Crates for machine learning, deep learning, large language models, AI agents, and related tooling |
| `asynchronous` | Asynchronous | Crates to help deal with events independently of the main program flow, using futures, promises, waiting, or eventing |
| `authentication` | Authentication | Crates for confirming identities |
| `automotive` | Automotive | Crates related to the automotive industry, including vehicle control and diagnostics |
| `caching` | Caching | Crates to store results of previous computations for reuse |
| `command-line-interface` | Command-line interface | Crates to help create command line interfaces such as argument parsers, line-editing, output coloring and formatting |
| `command-line-utilities` | Command line utilities | Applications to run at the command line |
| `compilers` | Compilers | Compiler implementations, including interpreters and transpilers |
| `compression` | Compression | Algorithms for making data smaller |
| `computer-vision` | Computer vision | Crates for comprehending the world from video or images |
| `concurrency` | Concurrency | Crates for implementing concurrent and parallel computation |
| `config` | Configuration | Crates for managing application configuration |
| `cryptography` | Cryptography | Algorithms intended for securing data |
| `data-structures` | Data structures | Rust implementations of particular ways of organizing data suited for specific purposes |
| `database` | Database interfaces | Crates to interface with database management systems |
| `database-implementations` | Database implementations | Database management systems implemented in Rust |
| `date-and-time` | Date and time | Crates to manage the inherent complexity of dealing with the fourth dimension |
| `development-tools` | Development tools | Crates that provide developer-facing features such as testing, debugging, linting, performance profiling, autocompletion, formatting |
| `email` | Email | Crates to help with sending, receiving, formatting, and parsing email |
| `embedded` | Embedded development | Crates useful on embedded devices or without an operating system |
| `emulators` | Emulators | Emulators allow one computer to behave like another, often to run software not natively available on the host |
| `encoding` | Encoding | Encoding and/or decoding data from one data format to another |
| `external-ffi-bindings` | External FFI bindings | Direct Rust FFI bindings to libraries written in other languages; often denoted by a `-sys` suffix |
| `filesystem` | Filesystem | Crates for dealing with files and filesystems |
| `finance` | Finance | Crates for dealing with money: accounting, trading, investments, taxes, banking, payment processing |
| `game-development` | Game development | Crates that focus on some individual part of accelerating the development of games |
| `game-engines` | Game engines | Crates that provide a "one-stop-shop" for all game development needs |
| `games` | Games | Applications for fun and entertainment |
| `graphics` | Graphics | Crates for graphics libraries and applications, including raster and vector graphics primitives |
| `gui` | GUI | Crates to help create a graphical user interface |
| `hardware-support` | Hardware support | Crates to interface with specific CPU or other hardware features |
| `internationalization` | Internationalization (i18n) | Crates to help develop software capable of adapting to multiple languages and regions |
| `localization` | Localization (L10n) | Crates to help adapt internationalized software to specific languages and regions |
| `mathematics` | Mathematics | Crates with a mathematical aspect |
| `memory-management` | Memory management | Crates to help with allocation, memory mapping, garbage collection, reference counting, or interfaces to foreign memory managers |
| `multimedia` | Multimedia | Crates that provide audio, video, and image processing or rendering engines |
| `network-programming` | Network programming | Crates dealing with higher-level network protocols such as FTP, HTTP, SSH, or lower-level protocols such as TCP, UDP |
| `no-std` | No standard library | Crates that are able to function without the Rust standard library |
| `os` | Operating systems | Bindings to operating system-specific APIs |
| `parser-implementations` | Parser implementations | Parsers implemented for particular formats or languages |
| `parsing` | Parsing tools | Crates to help create parsers of binary and text formats |
| `rendering` | Rendering | Real-time or offline rendering of 2D or 3D graphics, usually with the help of a graphics card |
| `rust-patterns` | Rust patterns | Shared solutions for particular situations specific to programming in Rust |
| `science` | Science | Crates related to solving problems involving physics, chemistry, biology, geoscience, and other scientific fields |
| `security` | Security | Crates related to cybersecurity, penetration testing, code review, vulnerability research, and reverse engineering |
| `simulation` | Simulation | Crates used to model or construct models for some activity, e.g. to simulate a networking protocol |
| `template-engine` | Template engine | Crates designed to combine templates with data to produce result documents |
| `text-editors` | Text editors | Applications for editing text |
| `text-processing` | Text processing | Crates to deal with the complexities of human language when expressed in textual form |
| `value-formatting` | Value formatting | Crates to format values for display, with locale-aware output for multiple languages and regions |
| `virtualization` | Virtualization | For creation and management of virtual environments including containerization systems |
| `visualization` | Visualization | Ways to view data, such as plotting or graphing |
| `wasm` | WebAssembly | Crates for use when targeting WebAssembly, or for manipulating WebAssembly |
| `web-programming` | Web programming | Crates to create applications for the web |

### Nested subcategory slugs

| slug | human name | description |
|------|-----------|-------------|
| `aerospace::drones` | Drones | Crates related to Multicopters, Fixed wing, VTOL, and Airships/Balloons |
| `aerospace::protocols` | Aerospace protocols | Protocol implementations for aerospace applications |
| `aerospace::simulation` | Aerospace simulations | Crates related to any kind of simulations used in aerospace (fluids, aerodynamics, etc.) |
| `aerospace::space-protocols` | Space protocols | Protocol implementations for use in space, like CCSDS |
| `aerospace::unmanned-aerial-vehicles` | Unmanned aerial vehicles | Crates related to UAVs: Multicopters, Fixed wing, VTOL, Airships/Balloons, Rovers, Boats, Submersibles |
| `cryptography::cryptocurrencies` | Cryptocurrencies | Crates for digital currencies, wallets, and distributed ledgers |
| `development-tools::build-utils` | Build Utils | Utilities for build scripts and other build time steps |
| `development-tools::cargo-plugins` | Cargo plugins | Subcommands that extend the capabilities of Cargo |
| `development-tools::debugging` | Debugging | Crates to help figure out what is going on with your code: logging, tracing, assertions |
| `development-tools::ffi` | FFI | Crates to help interface with other languages, including binding generators |
| `development-tools::procedural-macro-helpers` | Procedural macro helpers | Crates to help write procedural macros in Rust |
| `development-tools::profiling` | Profiling | Crates to help figure out the performance of your code |
| `development-tools::testing` | Testing | Crates to help verify the correctness of your code |
| `multimedia::audio` | Audio | Crates that record, output, or process audio |
| `multimedia::encoding` | Encoding | Crates that encode or decode binary data in multimedia formats |
| `multimedia::images` | Images | Crates that process or build images |
| `multimedia::video` | Video | Crates that record, output, or process video |
| `no-std::no-alloc` | No dynamic allocation | Crates that are able to function without the Rust alloc crate |
| `os::android-apis` | Android APIs | Bindings to Android-specific APIs |
| `os::freebsd-apis` | FreeBSD APIs | Bindings to FreeBSD-specific APIs |
| `os::linux-apis` | Linux APIs | Bindings to Linux-specific APIs |
| `os::macos-apis` | macOS APIs | Bindings to macOS-specific APIs |
| `os::unix-apis` | Unix APIs | Bindings to Unix-specific APIs |
| `os::windows-apis` | Windows APIs | Bindings to Windows-specific APIs |
| `rendering::data-formats` | Data formats | Loading and parsing of data formats related to 2D or 3D rendering, like 3D models or animation sheets |
| `rendering::engine` | Rendering engine | High-level solutions for rendering on the screen |
| `rendering::graphics-api` | Graphics APIs | Crates that provide direct access to hardware's or OS's rendering capabilities |
| `science::bioinformatics` | Bioinformatics | Crates for processing large-scale biological data |
| `science::bioinformatics::genomics` | Genomics | Crates for processing genetic data including sequences, abundance, variants, and analysis |
| `science::bioinformatics::proteomics` | Proteomics | Crates for processing protein data including sequences, abundance, and analysis |
| `science::bioinformatics::sequence-analysis` | Sequence analysis | Crates for processing biological sequences including alignment, assembly, and annotation |
| `science::computational-biology` | Computational Biology | Crates for computational modeling and simulation of biological systems |
| `science::computational-biology::structural-modeling` | Structural Modeling | Crates for protein and biomolecular structure prediction, docking, model refinement, and physics-based simulation |
| `science::computational-biology::systems-biology` | Systems Biology | Crates for network modeling, pathway modeling, metabolic modeling, and whole-system simulations |
| `science::computational-chemistry` | Computational Chemistry | Crates for computational methods in chemistry including electronic-structure calculations, molecular simulation, cheminformatics |
| `science::computational-chemistry::cheminformatics` | Cheminformatics | Crates for molecular representations, descriptors, chemical graph algorithms, file format parsing, QSAR tooling |
| `science::computational-chemistry::electronic-structure` | Electronic Structure | Crates for quantum chemistry and electronic-structure methods such as DFT, ab initio, correlated techniques |
| `science::computational-chemistry::molecular-simulation` | Molecular Simulation | Crates for molecular dynamics, Monte Carlo, force fields, statistical mechanics simulations |
| `science::geo` | Geospatial | Processing of spatial information, maps, navigation data, geographic information systems |
| `science::materials` | Materials Science | Crates for the study, characterization, and simulation of condensed matter and materials, including crystallography |
| `science::neuroscience` | Neuroscience | Crates for research tools and processing of data related to the brain and nervous system |
| `science::quantum-computing` | Quantum Computing | Crates for quantum computing including circuit construction, simulation, quantum algorithms, hardware backend interfaces |
| `science::robotics` | Robotics | Crates related to robotics |
| `web-programming::http-client` | HTTP client | Crates to make HTTP network requests |
| `web-programming::http-server` | HTTP server | Crates to serve data over HTTP |
| `web-programming::websocket` | WebSocket | Crates to communicate over the WebSocket protocol |

---

## keywords rules

Source: https://doc.rust-lang.org/cargo/reference/manifest.html

| constraint | value |
|-----------|-------|
| max count | 5 keywords |
| max length per keyword | 20 characters |
| charset | ASCII only |
| first character | must be alphanumeric (`[a-zA-Z0-9]`) |
| allowed characters | letters, numbers, `_`, `-`, `+` |

```toml
[package]
keywords = ["gamedev", "graphics", "opengl"]
```

---

## categories rules

Source: https://doc.rust-lang.org/cargo/reference/manifest.html

| constraint | value |
|-----------|-------|
| max count | 5 categories |
| valid values | must exactly match a slug from https://crates.io/category_slugs |
| case sensitivity | exact match required; slugs are lowercase |

```toml
[package]
categories = ["command-line-utilities", "development-tools::cargo-plugins"]
```

Categories that don't exactly match a known slug must be corrected before publishing. The manifest docs state slugs "must match exactly"; behavior for mismatches (warning vs. hard error) has changed between crates.io versions, so use only exact slugs from this list.

---

## badges

Source: https://doc.rust-lang.org/cargo/reference/manifest.html

**Status: deprecated.** crates.io no longer displays badges from `[badges]` on its website. The field is still accepted by Cargo but has no visible effect on crates.io.

Only one badge type remains documented:

| badge type | required field | allowed values |
|-----------|---------------|----------------|
| `maintenance` | `status` | see below |

### maintenance status values

| value | meaning |
|-------|---------|
| `actively-developed` | New features being added, bugs being fixed |
| `passively-maintained` | No new features planned; maintainer will respond to issues |
| `as-is` | Feature complete; maintainer not intending to continue working on it |
| `experimental` | Author wants to share but not targeting any particular use case |
| `looking-for-maintainer` | Current maintainer wants to transfer the crate |
| `deprecated` | Maintainer does not recommend using this crate |
| `none` | Displays no badge on crates.io |

```toml
[badges]
maintenance = { status = "actively-developed" }
```

---

## publish field

Source: https://doc.rust-lang.org/cargo/reference/manifest.html

| value | behavior |
|-------|---------|
| omitted | package may be published to any registry (default) |
| `publish = false` | package cannot be published to any registry |
| `publish = ["registry-name"]` | package may only be published to the listed registry/registries |

When the array contains a single registry, `cargo publish` uses it automatically without requiring `--registry`.

```toml
# Prevent publishing entirely:
publish = false

# Restrict to crates.io only:
publish = ["crates-io"]

# Restrict to a private registry:
publish = ["my-private-registry"]
```

---

## crates.io publish requirements

Source: https://doc.rust-lang.org/cargo/reference/manifest.html

All fields below are required or enforced by crates.io at publish time.

### required fields

| field | constraint |
|-------|-----------|
| `name` | alphanumeric, `-`, or `_` only; ASCII only; max 64 characters; must not be empty; must not use reserved names or Windows special names (e.g. `nul`) |
| `version` | SemVer format with three numeric parts (e.g. `1.0.0`); pre-release and build metadata allowed |
| `description` | plain text (not Markdown); must be set; no character limit documented |
| `license` OR `license-file` | one of the two must be present; `license` must be a valid SPDX 2.3 expression (e.g. `"MIT OR Apache-2.0"`); `license-file` is a path to a license text file |

### optional fields (with crates.io-specific limits when present)

| field | constraint |
|-------|-----------|
| `keywords` | max 5; each max 20 chars, ASCII, alphanumeric start, `[a-zA-Z0-9_\-+]` chars only |
| `categories` | max 5; each must exactly match a slug from crates.io/category_slugs |

### SPDX license expression examples

```
MIT
Apache-2.0
MIT OR Apache-2.0
LGPL-2.1-only AND MIT AND BSD-2-Clause
```
