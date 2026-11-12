# Security

Load when code writes a secret to disk, encrypts or hashes a credential, adds a dependency, or does arithmetic or indexing on untrusted input.
Code-level gotchas that pass every test and fail an audit. Hasher choice for untrusted keys is also a security decision: that one lives in `performance.md`.

## Secret Files: 0600 on the Temp, Before the Rename

An atomic write (temp file + rename) of a token, key, or `.env` ends with the final file carrying the **temp's** mode. A temp created under the default umask gets `0o666 & !umask`, commonly `0644`: the secret lands world-readable and the mode persists after the rename. `fs::write` and `File::create` apply the umask; chmod-after-write leaves a readable window. Pin the mode at creation:

```rust
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::Path;

// `tmp`: a fresh, unpredictable name in the same directory as `path`
fn write_secret(path: &Path, tmp: &Path, secret: &[u8]) -> std::io::Result<()> {
    // wrong: `let tmp = path.with_extension("tmp");` is one fixed name for every write
    let mut opts = OpenOptions::new();
    opts.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        opts.mode(0o600); // set BEFORE any byte is written
    }
    let mut f = opts.open(tmp)?;
    f.write_all(secret)?;
    f.sync_all()?;
    fs::rename(tmp, path)?; // final file keeps the 0600
    #[cfg(unix)]
    {
        let dir = match path.parent() {
            Some(d) if !d.as_os_str().is_empty() => d,
            _ => Path::new("."), // a bare file name's parent is `""`
        };
        fs::File::open(dir)?.sync_all()?; // makes the rename durable
    }
    Ok(())
}
```

- Create the temp in the destination's directory: `fs::rename` fails across mount points.
- After the `rename`, `fsync` the parent directory (on Unix: `File::open(dir)?.sync_all()?`, behind `cfg(unix)`): without it a crash can lose the rename even though the file data was synced.
- Open the temp with `create_new(true)`: the create is atomic and fails when the path exists. Never check for existence and then create: that is a TOCTOU race.
- The temp name is unique and unpredictable per write. A fixed `path.with_extension("tmp")` collides when two writers run at once: `create_new` then fails. For a `path` that itself ends in `.tmp` it is the destination: `create_new` fails if the file exists, and a new file gets the secret written in place, with no atomic rename. Build `tmp` from the destination's file name plus a random suffix, or use a crate that creates temp files securely (`tempfile`: `NamedTempFile::new_in(dir)`, then `persist(path)`); the same-directory and `0o600` rules still hold.
- `.mode()` exists only in `std::os::unix::fs::OpenOptionsExt`: gate it with `cfg(unix)`, or the code does not compile on other targets. The OS masks the requested bits with the umask, so `0o600` is an upper bound.
- Parent dirs get `0o700` at creation: `DirBuilder::new().recursive(true).mode(0o700).create(dir)` (`std::os::unix::fs::DirBuilderExt`, behind `cfg(unix)`), never `create_dir_all` followed by a chmod.
- Centralize this as one helper and make it the only sanctioned writer for secret files. A plain `fs::write` that creates the file gives it `0o666 & !umask`, commonly `0644`; writing to an existing file leaves its mode untouched. So a secret file is only ever created through the helper.

## Secrets at Rest

- AEAD (e.g. AES-256-GCM) with a fresh random 12-byte nonce per encryption; store `nonce ‖ ciphertext ‖ tag`. Key comes from a dedicated env var: document next to it that rotating the key orphans existing blobs.
- Bind each ciphertext to its storage slot by passing the filename (or other positional ID) as AEAD associated data on both encrypt and decrypt. A blob copied or renamed into another slot then fails to decrypt: tamper evidence with no extra field and no extra key.
- One secret per crypto role: cookie signing, API-key HMAC, and token AEAD never share a value: a leak in one role would compromise all. Check pairwise-distinctness at startup and refuse to boot on a match.
- Store API keys as HMAC-SHA256 with a server-side pepper, so a database dump yields nothing usable. Derive fixed-size keys from variable-entropy secrets with HKDF; never truncate or repeat the raw secret.
- Verify a MAC tag with the MAC's constant-time check (RustCrypto `Mac::verify_slice`), never `==` on the tag bytes.
- Erase key material explicitly when its use ends. Never leave erasure to `Drop` alone: `mem::forget`, a leak, an `Rc` cycle and an abort all skip destructors. `clippy::mem_forget`
- A plain overwrite (`key.fill(0)`, a zeroing loop) is no erasure: the optimizer may delete a write nothing reads. Erase with the `zeroize` crate, whose zeroing is guaranteed not to be optimized away: call `key.zeroize()` (trait `Zeroize`) when the use ends, and hold the key in `Zeroizing::new(..)` (zeroize 0.7) so the drop path erases it too. On your own key type, `#[derive(Zeroize, ZeroizeOnDrop)]` (zeroize 1.5, feature `derive`) generates the erasing `Drop`; a hand-written `impl ZeroizeOnDrop for K {}` alone erases nothing: it is a marker.
- Without the crate, and only in a crate that allows `unsafe`: `for b in key.iter_mut() { unsafe { std::ptr::write_volatile(b, 0) } }` (a `&mut u8` coerces to `*mut u8`), which is never elided, inside the one type that owns the key. The block and its `// SAFETY:` comment follow `unsafe.md`.
- A type that holds a secret never derives `Debug`: hand-write `fmt` to print a placeholder, and test that `format!("{secret:?}")` lacks the value. Code pair: `observability.md`.
- Captured test output is unredacted: inspect a nextest recording for secrets before sharing it outside the team.

## Arithmetic and Indexing on Untrusted Input

Safe Rust guarantees memory safety, nothing more: overflow, leaks and logic races still compile.

- A size, length, index, offset or amount that depends on input never uses bare `+`, `-`, `*`: the operator panics where overflow checks are on (dev by default) and wraps silently where they are off (release by default). Pick the method by intent:

| Intent | Method | On overflow |
|---|---|---|
| overflow is an error | `checked_add` | returns `None` |
| clamp at the limit | `saturating_add` | returns the type's min or max |
| modular arithmetic (hashes) | `wrapping_add` | wraps |
| need the flag | `overflowing_add` | returns `(wrapped, true)` |

```rust
fn frame_end(offset: usize, len: usize, buf: &[u8]) -> Option<usize> {
    // wrong: `let end = offset + len;` wraps in release, then the bounds test passes
    let end = offset.checked_add(len)?;
    (end <= buf.len()).then_some(end)
}
```

The same four prefixes exist for `sub` and `mul`. `clippy::arithmetic_side_effects`

- An `as` cast between integer types never fails and truncates silently: `300u32 as u8` is `44`. Convert with `u8::try_from(n)` (1.34) and handle the `Err`; keep `as` only where the value provably fits. `clippy::cast_possible_truncation`
- An index that depends on input: `slice.get(i)` and handle `None`, never `slice[i]`. `clippy::indexing_slicing`
- `.expect("why it cannot fail")` and `assert!` only for states the function's contract rules out; no `.unwrap()` outside tests. Malformed input is an expected failure: return `Err`.
- A `Result` is tested, never ignored.
- Integers, enums and pointers arriving over FFI are checked before use: see `ffi.md`.
- A parser or decoder of untrusted bytes gets a fuzz target: see `testing.md`.
- A path built from untrusted input (traversal, `join` with an absolute path, `set_extension`), a file under `env::temp_dir()`, an argument for `cmd.exe`, `remove_dir_all` in security-sensitive code and the binary `Command::new` finds on Windows: see `io-process.md`.

## Supply Chain

- Vet a crate before `cargo add` and record the review: maintainer, advisories, licence, and its transitive dependencies. Never take the first search hit.
- Run `cargo audit` (known vulnerabilities) and `cargo outdated` on the dependency tree.
- Add `cargo deny check` for licence and crate-source policy (`licenses`; `sources` since cargo-deny 0.6.0). Its `advisories` check fails on `unmaintained` crates by default.
- Commit `Cargo.lock`, for libraries too. Never list it in `.gitignore`.

## Checklist

- [ ] Every secret file is created by the one helper: uniquely named temp in the same directory, `create_new`, `0o600` at creation, then `rename`, then (Unix) `fsync` the parent directory.
- [ ] No `fs::write` or `File::create` creates a file holding a secret.
- [ ] Each crypto role has its own key; nonces are fresh per encryption; key material is erased explicitly, with `zeroize` or volatile writes.
- [ ] No `==` on a MAC tag; no derived `Debug` on a type that holds a secret.
- [ ] No bare `+`, `-`, `*` or `[i]` on a value that depends on input, and no `as` the code has not proven fits.
- [ ] No `unwrap` / `expect` on input-dependent data; no ignored `Result`.
- [ ] New dependencies were vetted; `cargo audit` is clean; `Cargo.lock` is committed.
