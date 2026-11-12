# CLI

- Load when writing or changing a command-line interface built with clap's derive API (clap 4).
- Exit codes, colour and prompts are not covered here.

## Setup

```toml
[dependencies]
clap = { version = "4", features = ["derive"] }
```

- Without the `derive` feature `#[derive(Parser)]` does not resolve. `#[arg(env)]` also needs the `env` feature.
- Use the derive API. Use the builder (`Command::new(..).arg(..)`) only when the order or the source of values matters (`indices_of`, `value_source`).

## The Field Type Decides

| Want | Write |
|---|---|
| required positional | `name: String` with no `#[arg]`. A bare field is never `--name` |
| required option `--name <NAME>` | `#[arg(short, long)] name: String` |
| optional argument | `Option<T>` |
| on/off switch | `#[arg(long)] verbose: bool`, never `Option<bool>` (that one takes a value) |
| repeatable, or many values | `Vec<T>`. A scalar field rejects the second occurrence |
| counter `-vvv` | `#[arg(short, action = clap::ArgAction::Count)] verbose: u8` |
| flag whose value is optional | `Option<Option<T>>`: `--tag` alone is `Some(None)` |
| default | `#[arg(default_value_t = 8080)] port: u16`, not `Option` plus `unwrap_or` |
| default for a `Vec<T>` whose `T` has `Display` | `#[arg(default_values_t = vec![..])]` |
| default for `PathBuf` or `OsString` | `#[arg(default_value_os_t = PathBuf::from("out"))]` |
| default for a `Vec<PathBuf>` or `Vec<OsString>` | `#[arg(default_values_os_t = vec![PathBuf::from("out")])]` |
| fixed set of choices | an enum with `#[derive(Clone, ValueEnum)]` |
| number in a range | `#[arg(value_parser = clap::value_parser!(u16).range(1..))]` |
| string from a short fixed list | `#[arg(value_parser = ["always", "auto", "never"])] color: String` |
| custom parsing | `#[arg(value_parser = parse_pair)]` with `fn parse_pair(s: &str) -> Result<T, String>` |
| env fallback | `#[arg(long, env)] config: Option<PathBuf>` reads `CONFIG` |
| field that is not an argument | `#[arg(skip)]`, filled with `Default::default()` |
| option usable after a subcommand | `#[arg(long, global = true)]`. A subcommand's `Args` struct reads it with `#[arg(from_global)]` on a field of the same name |
| shared argument set | `#[command(flatten)] common: Common` with `#[derive(Args)] struct Common` |

The three most common wrong forms:

```rust
#[derive(clap::Parser)]
struct Wrong {
    config_file: String, // a positional, not `--config-file`: add `#[arg(long)]`
    #[arg(long)]
    verbose: Option<bool>, // takes a value (`--verbose true`): use `bool`
    #[arg(long)]
    file: String, // a second `--file` is an error: use `Vec<String>`
}
```

## Skeleton

```rust
use std::path::PathBuf;

use clap::{Args, Parser, Subcommand, ValueEnum};

#[derive(Parser)]
#[command(version, about, propagate_version = true)]
struct Cli {
    /// Print more detail (repeat for more)
    #[arg(short, long, global = true, action = clap::ArgAction::Count)]
    verbose: u8,

    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Start the server
    Serve {
        /// Port to listen on
        #[arg(long, default_value_t = 8080, value_parser = clap::value_parser!(u16).range(1..))]
        port: u16,

        /// How much to check
        #[arg(long, value_enum, default_value_t = Mode::Fast)]
        mode: Mode,

        #[command(flatten)]
        source: Source,
    },
    /// Manage remotes
    Remote {
        #[command(subcommand)]
        command: RemoteCommands,
    },
}

#[derive(Subcommand)]
enum RemoteCommands {
    /// Add a remote
    Add { name: String },
}

#[derive(Clone, ValueEnum)]
enum Mode {
    /// Skip the slow checks
    Fast,
    /// Run every check
    Full,
}

// Exactly one of these must be given.
#[derive(Args)]
#[group(required = true, multiple = false)]
struct Source {
    /// Read this file
    #[arg(long)]
    file: Option<PathBuf>,

    /// Read standard input
    #[arg(long)]
    stdin: bool,
}

fn main() {
    let cli = Cli::parse();
    match cli.command {
        Commands::Serve { port, .. } => println!("port {port}, verbosity {}", cli.verbose),
        Commands::Remote { command: RemoteCommands::Add { name } } => println!("add {name}"),
    }
}

#[test]
fn verify_cli() {
    use clap::CommandFactory;
    Cli::command().debug_assert();
}
```

## Attributes

- `#[command(..)]` goes on the parser type and on subcommands, `#[arg(..)]` on fields, `#[value(..)]` on `ValueEnum` variants.
- `#[arg(short, long)]` takes `-n` and `--name` from the field name. Long names are kebab-case: `config_file` becomes `--config-file`. Never write `long = "config_file"`.
- Any `Command` or `Arg` builder method works as an attribute: `#[command(next_line_help = true)]`. One argument: `method = value`. Several: `#[arg(required_if_eq("out", "file"))]`. Never configure the command after `parse()`.
- `#[command(version, about)]` reads `Cargo.toml`: never hardcode either. `--version` exists only when `version` is set. With subcommands add `propagate_version = true`.
- A flattened `Args` struct carries no `#[command(version, about)]`: it would be applied to every command that flattens it. Its `///` comment likewise becomes the `about` of a command that has no doc comment of its own: use `//` on that struct.

## Subcommands

- Subcommands are a `#[derive(Subcommand)]` enum on a `#[command(subcommand)]` field. A variant holding another such field nests one level deeper.
- `command: Commands` makes the subcommand required. `Option<Commands>` makes it optional.
- An option declared above the subcommand is rejected after it (`app serve --verbose`) unless it has `global = true`. Never copy it into every subcommand.

## Values and Validation

- A type that implements `FromStr` (`u16`, `IpAddr`, `PathBuf`) parses itself. Never take a `String` and call `.parse()` later.
- `ValueEnum` needs `Clone` beside it and unit variants only: mark any other variant `#[value(skip)]`. One doc-comment line per variant is its help.
- A `ValueEnum` field with a default: `#[arg(value_enum, default_value_t = Mode::Fast)]`. Without `value_enum` the default's type needs `Display`.
- Flags that are states of one choice are one `ValueEnum` option, not several `bool` fields. A struct with more than three `bool` fields trips `clippy::struct_excessive_bools`.
- Independent switches that stay `bool`: `#[expect(clippy::struct_excessive_bools, reason = "..")]` on the struct (1.81+; below it plain `#[allow(..)]`), or a raised `max-struct-bools` in `clippy.toml`.
- An enum from another crate: `value_parser = clap::builder::PossibleValuesParser::new(["a", "b"]).map(|s| s.parse::<T>().expect("a listed value parses"))`, with `use clap::builder::TypedValueParser as _;` in scope.
- Validate inside clap, not after it: a range, or a `value_parser` function whose `Err` text is shown to the user.
- Exactly one of several: a `#[derive(Args)]` struct with `#[group(required = true, multiple = false)]`, flattened. Never check combinations by hand.
- Two options that exclude each other: `#[arg(long, conflicts_with = "other")]` on one side only. One that needs another: `requires = "other"`.
- A check clap cannot express: `Cli::command().error(ErrorKind::ArgumentConflict, "message").exit()`, with `use clap::{CommandFactory, error::ErrorKind};`. Never `eprintln!` plus `process::exit`.

## Help Text

- A doc comment is the help text. Its first paragraph shows under `-h`, the whole comment under `--help`: separate the two with a blank `///`.
- An explicit `help = ".."` (on a field) or `about = ".."` (on a command) overrides the doc comment: write the attribute or the doc comment, never both.

## Stale Forms

Current forms are clap 4.0+. A crate pinned to clap 3 keeps its own forms.

| Stale | Current |
|---|---|
| `structopt` crate, `#[derive(StructOpt)]` | `clap` with `derive`, `#[derive(Parser)]` |
| `#[clap(..)]`, `#[structopt(..)]` | `#[command(..)]`, `#[arg(..)]`, `#[value(..)]` |
| `parse(try_from_str)` | nothing: the field type picks the parser. Otherwise `value_parser = ..` |
| `multiple(true)`, `multiple_occurrences(true)` | a `Vec<T>` field, or `ArgAction::Append` and `num_args(..)` |
| `takes_value(false)` | a `bool` field (`ArgAction::SetTrue`) |
| `App` | `Command` |

## Checklist

- [ ] `clap` has the `derive` feature; no `structopt`, no `#[clap(..)]`.
- [ ] Every option has `#[arg(long)]` or `#[arg(short, long)]`; only real positionals are bare fields.
- [ ] Switches are `bool`, optional values `Option<T>`, repeats `Vec<T>`.
- [ ] Options meant to work after a subcommand have `global = true`.
- [ ] Every `ValueEnum` enum also derives `Clone`.
- [ ] Validation lives in `value_parser`, a group or `conflicts_with`, not in `main`.
- [ ] Every argument and subcommand has a doc comment.
- [ ] A test calls `Cli::command().debug_assert()`.
