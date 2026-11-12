# I/O and Processes

Load when code reads or writes a stream or a file, builds or compares a path, spawns a process, reads the environment, exits, or measures time.
The traps here compile and pass a quick test: short writes, lost buffers, truncated files, zombie children, pipe deadlocks. A version in parentheses is that form's minimum Rust: below the crate's `rust-version`, keep the older form.

## Reading and Writing

- `write` may write only part of the buffer and still return `Ok`: call `write_all`. `read` fills only part of the buffer: use the count it returns, `&buf[..n]`, or fill it with `read_exact(&mut buf)?` (1.6). `clippy::unused_io_amount`
- `Ok(0)` from a read means end of input: every read loop breaks on it.
- `read_to_end` and `read_to_string` return only at end of input. On stdin, a socket or a live pipe, read line by line.
- `read_line` appends to the buffer and keeps the `\n`: `line.clear()` before each call, `.trim()` before `.parse()`. `clippy::read_line_without_trim`
- `reader.lines()` yields `io::Result<String>` items without the `\n` or `\r\n`: no `clear()`, nothing to strip.
- A `BufWriter` flushes on drop and throws the error away: call `.flush()?` before it goes out of scope.

```rust
use std::io::{self, BufRead, Write};
fn sum_lines(mut input: impl BufRead, mut out: impl Write) -> io::Result<()> {
    let mut line = String::new();
    let mut total = 0i64;
    loop {
        line.clear(); // read_line appends
        if input.read_line(&mut line)? == 0 {
            break; // Ok(0) = end of input
        }
        // WRONG: line.parse() (the kept "\n" makes it fail)
        total += line.trim().parse::<i64>().unwrap_or(0);
    }
    // WRONG: out.write(..)? (may write only part)
    out.write_all(format!("{total}\n").as_bytes())?;
    out.flush() // reports the error a drop would swallow
}
```

- Many small reads or writes on a `File` or socket: wrap it once in `BufReader` or `BufWriter`. Keep one `BufReader` per stream for its whole life: a second one, or the raw stream after `into_inner()`, misses the bytes already buffered.
- Stream to stream: `io::copy(&mut reader, &mut writer)?`, not a hand-written loop.
- A function that does I/O returns `io::Result<T>` and uses `?`; outside tests, no `unwrap()` or `expect()` on I/O calls.
- Data goes to stdout with `println!`; diagnostics go to stderr with `eprintln!`.
- A prompt without a newline needs `io::stdout().flush()?` before the read.
- Many lines in a loop: `let mut out = io::stdout().lock();` then `writeln!(out, ..)?`. Same for `io::stdin().lock()`. In a hot loop reuse one `String` with `read_line` instead of `.lines()`.
- `println!` panics when stdout is a closed pipe: on Unix std ignores `SIGPIPE`, so the write fails instead of the process dying. Where that is a normal case, write through `io::stdout()` and handle the `Err`.
- Cap each line read from untrusted input: `let n = reader.by_ref().take(64 * 1024).read_line(&mut line)?;` (`by_ref()` lends the reader for that one call; a `take` built outside the loop caps the whole stream). `n == 64 * 1024` with no trailing `\n` means the line was cut: return an error, never parse the rest as a new line.
- `match err.kind()` ends with a `_ =>` arm: `ErrorKind` is non-exhaustive.

## Files

- `fs::write` and `File::create` truncate the file. To add to a file, open it in append mode; never seek to the end and write.
- Append one log record in one call: build the whole line first (`format!`). A call per part lets other writers' output land inside the record.

| Task | Call |
|---|---|
| Read a whole file | `fs::read_to_string(p)?` for UTF-8 text, `fs::read(p)?` for any bytes. `clippy::verbose_file_reads` |
| Replace a whole file | `fs::write(p, data)?` |
| Append, creating if missing | `OpenOptions::new().create(true).append(true).open(p)?` |
| Read and write one handle | `OpenOptions::new().read(true).write(true).create(true).open(p)?`; `File::create` is write-only |
| Create only if absent | `File::create_new(p)?` (1.77), never `if !p.exists() { File::create(p) }` |
| Create a directory and its parents | `fs::create_dir_all(p)?`. `clippy::create_dir` |
| Exists, with errors kept | `fs::exists(p)?` (1.81); `p.exists()` turns every error into `false` |
| Is a directory, with errors kept | `fs::metadata(p)?.is_dir()` |
| Is a symlink | `fs::symlink_metadata(p)?.is_symlink()` (1.58); `fs::metadata` follows the link |
| Data must reach the disk | `f.sync_all()?`; dropping a `File` ignores errors |

- `.create(true)` needs `.write(true)` or `.append(true)`. `.append(true)` alone does not create the file.
- Do not test `exists()` or `is_file()` before opening: open, and handle the error.
- `fs::read_dir` yields entries in no fixed order: collect and sort when order matters.
- `fs::rename` fails across filesystems: on `ErrorKind::CrossesDevices` (1.85) fall back to `fs::copy` then `fs::remove_file`; propagate every other error.
- Never open a fixed name under `env::temp_dir()`: use a random name with `create_new`, or a temp-file crate.
- `fs::remove_dir_all` fails when the directory is already gone: ignore that error only where the removal need not be checked. Its symlink-race protection is missing on QNX, Redox OS, VxWorks and under Miri: no security-sensitive use there.
- `file.try_clone()` shares one cursor with the original handle: a read or seek on one moves the other.
- Owning a `File` is not owning the file: other handles and processes read and write it at the same time. Never treat an earlier read as a snapshot; re-read what must be current.

```rust
use std::fs::OpenOptions;
use std::io::{self, Read, Write};
fn log_line(path: &str, line: &str) -> io::Result<()> {
    // WRONG: std::fs::write(path, line) (erases every earlier line)
    let mut log = OpenOptions::new().create(true).append(true).open(path)?;
    log.write_all(line.as_bytes())
}
fn head(mut src: impl Read) -> io::Result<Vec<u8>> {
    let mut buf = [0u8; 16];
    let n = src.read(&mut buf)?; // WRONG: using all of `buf` afterwards
    Ok(buf[..n].to_vec())
}
```

## Paths

- Compare by component: `path.starts_with(base)`, `ends_with`, `strip_prefix`. A string prefix test accepts `/etc/passwd.txt` for `/etc/passwd`.
- `base.join(p)` and `push(p)` with an absolute `p` give `p` alone: `Path::new("/etc").join("/bin/sh")` is `/bin/sh`. `clippy::join_absolute_paths`
- An untrusted name must be exactly one normal component before it reaches `join`, `set_file_name` or `set_extension`: `set_extension` panics on a separator, `set_file_name` keeps it.

```rust
use std::path::{Component, Path, PathBuf};
fn child(base: &Path, name: &str) -> Option<PathBuf> {
    // WRONG: base.join(name) ("/etc/x" replaces base, "../x" escapes it)
    let mut parts = Path::new(name).components();
    match (parts.next(), parts.next()) {
        (Some(Component::Normal(n)), None) => Some(base.join(n)),
        _ => None,
    }
}
// WRONG: p.to_string_lossy().starts_with("/etc/passwd")
assert!(!Path::new("/etc/passwd.txt").starts_with("/etc/passwd"));
assert_eq!(child(Path::new("/srv"), "../x"), None);
```

- Parameters take `&Path` or `impl AsRef<Path>`, and `&OsStr`, never `&PathBuf` or `&OsString`.
- Print with `path.display()`, never `path.to_str().unwrap()` or `.expect(..)`. `to_str()` returns an `Option`; `to_string_lossy()` is for display only.
- `Path` methods do not resolve `..` or symlinks. `fs::canonicalize(p)?` does, but the path must exist and on Windows the result is a `\\?\` path to keep inside the process. `std::path::absolute(p)?` (1.79) only makes it absolute.
- Path comparison (`==`, `starts_with`, `ends_with`) is case-sensitive on every platform, Windows drive letters aside: never lowercase both sides first.
- Name parts come from `file_stem()`, `extension()`, `file_name()`; never split on `.`. Test an extension with `ext.eq_ignore_ascii_case("rs")`, not `name.ends_with(".rs")`. `clippy::case_sensitive_file_extension_comparisons`

## Child Processes

- `Command` runs no shell: the program alone in `Command::new`, one `.arg()` per argument. `Command::new("ls -l")` looks for a program named `ls -l`.
- Builder methods return `&mut Command`: bind first, `let mut cmd = Command::new("git");`, then `cmd.arg("status");`. `let cmd = Command::new("git").arg("status");` fails once `cmd` is used: the temporary died at the `;`.
- `Ok` from `.output()` or `.status()` means the child ran, not that it succeeded: check `status.success()`.
- To capture output, `cmd.output()?` is the simple correct form: it pipes and drains stdout and stderr, then waits. A stream pre-set to `Stdio::inherit()` or `null()` stays so, its `Output` field empty; tokio's `output()` pipes both anyway.
- With `spawn()`: set `Stdio::piped()` on each stream to read (the handle is `None` without it) and take it with `child.stdout.take()`, never `child.stdout`.
- Never `wait()` while a piped stream is unread: the child blocks on a full pipe and both sides hang. Read to the end first, or call `wait_with_output()`, which drains both pipes while it waits.
- Large stdin: write it from another thread (tokio: another task), let the handle drop to send EOF, and collect with `wait_with_output()`.
- Dropping a `Child` neither kills nor waits. Always `wait()`, after `kill()` when stopping it, in tests too. A tokio `Child` also keeps running: `kill_on_drop(true)` and await `wait()`. `clippy::zombie_processes`
- Polling with `try_wait()` (1.18) does not close stdin, unlike `wait()`: `drop(child.stdin.take())` first.
- tokio: open a FIFO or device with `tokio::net::unix::pipe` or `AsyncFd`, not `tokio::fs`.

```rust
use std::io::{self, Write};
use std::process::{Command, Stdio};
fn sort_text(input: Vec<u8>) -> io::Result<Vec<u8>> {
    // WRONG: Command::new("sort -u")
    let mut cmd = Command::new("sort");
    cmd.arg("-u").stdin(Stdio::piped()).stdout(Stdio::piped());
    let mut child = cmd.spawn()?;
    let mut stdin = child.stdin.take().expect("stdin is piped");
    let writer = std::thread::spawn(move || stdin.write_all(&input)); // drop sends EOF
    let out = child.wait_with_output()?; // WRONG: child.wait()? with stdout unread
    writer.join().expect("writer thread should not panic")?;
    if !out.status.success() {
        return Err(io::Error::other(format!("sort failed: {}", out.status)));
    }
    Ok(out.stdout)
}
```

- Report a failed child with `{status}`. `status.code()` is `None` when a signal ended it (Unix): never `unwrap` or `expect` it.
- A child inherits the whole environment: `.env_clear()` then `.env(k, v)` when it must not. After changing `PATH` or `current_dir`, name the program by absolute path.
- Program lookup after `env_clear()` or `env_remove("PATH")`: Unix searches an OS default (typically `/bin:/usr/bin`), not the parent's `PATH`; Windows still searches the parent's `PATH`. On Windows the current executable's directory and the system directories come before the parent's `PATH`, so a same-named binary there wins.
- Windows: validate untrusted arguments before they reach `cmd.exe` or a `.bat` file.
- Forward child-process output with `io::stdout().write_all(&output.stdout)?`; `println!` mangles encoding and panics on broken pipes.
- Long-form flags when spawning external commands (`--force`, not `-f`): the call site is its own documentation.
- Feature-detect external tools by parsing `--version` output; where that's unreliable, sniff for specific stderr messages. Either way, probe with plain `.output()` so a failed probe stays non-fatal.
- Unexpected or unparseable external-tool output fails loud, with a message naming the command, never a silent fallback; a clean skip is only for a known not-applicable state (missing binary, wrong OS), distinct from "ran, found nothing" and from failure.

## Environment, Exit and Time

- `env::set_var` and `remove_var` are `unsafe` in edition 2024 and race with every thread that reads the environment (non-Windows). Give a child its variables with `Command::env`.
- Read with `env::var_os` and `env::args_os` unless non-UTF-8 input may be refused: `env::args()` panics on it, `env::var` returns `Err`.
- Split and join `PATH`-like values with `env::split_paths` and `env::join_paths`, never `split(':')`.
- Values known at build time (`CARGO_PKG_VERSION`): `env!("..")` or `option_env!`, not `env::var` at run time.
- `env::args().next()` is not a trusted path to the executable, and `env::current_exe()` is no security boundary either.
- Exit by returning from `main`: `fn main() -> Result<(), E>` or `-> ExitCode` (1.61). `process::exit` and `abort` skip destructors: flush buffered output first. `clippy::exit`
- Elapsed time: `Instant::now()` then `.elapsed()`. `SystemTime` can go backwards, so its `elapsed()` and `duration_since()` return a `Result`: handle it.

```rust
use std::process::Command;
use std::time::Instant;
// WRONG: std::env::set_var("LANG", "C"); (edition 2024: needs `unsafe`, races other threads)
let mut cmd = Command::new("date");
cmd.env("LANG", "C"); // only the child sees it
let start = Instant::now(); // WRONG: SystemTime::now() for a duration
println!("{:?} {:?}", cmd.get_program(), start.elapsed());
```

## Checklist

- Every `write` is `write_all`; every `read` count is used; every read loop stops on `Ok(0)`.
- Every `BufWriter` has an explicit `flush()?`.
- No `fs::write` or `File::create` on a file meant to keep its content.
- No `exists()` check followed by a create or open.
- No string prefix test on a path; no untrusted input straight into `join`, `push` or `set_file_name`.
- Each `Command`: one `.arg()` per argument, `status.success()` checked, each spawned `Child` waited, piped output drained before or during the wait.
- No `env::set_var`; no `process::exit` with unflushed output; durations from `Instant`.
