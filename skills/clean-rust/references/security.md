# Security

Code-level gotchas that pass every test and fail an audit. Hasher choice for untrusted keys is also a security decision — that one lives in `performance.md`.

## Secret Files: 0600 on the Temp, Before the Rename

An atomic write (temp file + rename) of a token, key, or `.env` ends with the final file carrying the **temp's** mode. A temp created under the default umask is `0644` — the secret lands world-readable and the mode persists after the rename. `fs::write` and `File::create` apply the umask; chmod-after-write leaves a readable window. Pin the mode at creation:

```rust
#[cfg(unix)]
{
    use std::os::unix::fs::OpenOptionsExt;
    let mut f = OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(0o600)          // set BEFORE any byte is written
        .open(&tmp)?;
    f.write_all(secret)?;
    f.sync_all()?;
}
fs::rename(&tmp, &path)?;     // final file keeps the 0600
```

Parent dirs get `0o700`. Centralize this as one helper and make it the only sanctioned writer for secret files — any plain `fs::write` of a secret silently reverts it to `0644`. Gate the mode bits with `cfg(unix)`; they're a no-op elsewhere.

## Secrets at Rest

- AEAD (e.g. AES-256-GCM) with a fresh random 12-byte nonce per encryption; store `nonce ‖ ciphertext ‖ tag`. Key comes from a dedicated env var — document next to it that rotating the key orphans existing blobs.
- Bind each ciphertext to its storage slot by passing the filename (or other positional ID) as AEAD associated data on both encrypt and decrypt. A blob copied or renamed into another slot then fails to decrypt — tamper evidence with no extra field and no extra key.
- One secret per crypto role: cookie signing, API-key HMAC, and token AEAD never share a value — a leak in one role would compromise all. Check pairwise-distinctness at startup and refuse to boot on a match.
- Store API keys as HMAC-SHA256 with a server-side pepper, so a database dump yields nothing usable. Derive fixed-size keys from variable-entropy secrets with HKDF — never truncate or repeat the raw secret.
