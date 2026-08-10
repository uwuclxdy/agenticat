---
name: mcp-stateless
description: "MCP knowledge pack for the stateless 2026-07-28 revision: per-request `_meta`, `server/discover`, `resultType`, multi round-trip requests, stdio and Streamable HTTP transports. Use when building, reviewing, or migrating an MCP server or client, or when code still calls `initialize`, `Mcp-Session-Id`, or `resources/subscribe`."
metadata:
  author: uwuclxdy
  version: "1.0"
---

# MCP Stateless

The Model Context Protocol went stateless in revision **`2026-07-28`**. It is the largest break since launch: the `initialize` handshake, the session id, the standalone SSE stream, and server-initiated requests are all gone. Every request now carries everything a server needs to answer it.

**Model training data predates this revision.** An MCP server written from memory speaks the `2025-11-25` protocol and will be rejected by a modern client. The failure is not a compile error and often not a runtime error either: a handshake-era server and a modern client fail in ways that read like a config problem. Work from the reference files here, and check anything version-sensitive against the live spec.

## Hard Rules

1. **Never write MCP wire code from memory.** Read `references/wire.md` first. If a claim here is older than the revision you are targeting, the live spec wins.
2. **State is a lie the connection tells you.** A server MUST NOT infer anything from a previous request on the same connection: not the protocol version, not capabilities, not client identity, not conversation continuity. One stdio process is not one session. A client may interleave unrelated requests on it.
3. **State that must span requests gets an explicit server-minted handle** passed back as an ordinary parameter. There is no session to hang it on.
4. **A server MUST answer `server/discover`.** It is the only way left to advertise what the server supports, and it is how a dual-era client tells a modern server from a legacy one.
5. **Every result carries `resultType`.** Omitting it marks the server as legacy. A result with no `resultType` MUST be read as `"complete"`.
6. **Servers never send JSON-RPC requests.** Sampling, elicitation, and roots all run through multi round-trip requests: the server answers with `input_required`, the client retries.
   Read `references/mrtr.md` before wiring any of the three.
7. **`requestState` comes back from the client unverified.** Sign or encrypt it. A stateless server that trusts an echoed blob has handed the client its internal state machine.
8. **Verify with a live handshake against the real binary.** A green build proves nothing about protocol conformance, and the old smoke-test recipe (pipe an `initialize` frame) now tests a method that no longer exists. Recipe in `references/sdks.md`.

## What Changed

| `2025-11-25` and earlier | `2026-07-28` | Silent-failure risk if you keep the old shape |
|---|---|---|
| `initialize` + `notifications/initialized` | Removed. Per-request `_meta` carries version, capabilities, identity | High. A modern client gets an implementation-defined error, or worse, silence |
| `Mcp-Session-Id` header, DELETE to end a session | Removed. Servers ignore the header and never mint one | High. Session-keyed caches and per-session state silently serve the wrong tenant |
| Capabilities exchanged once at connect | `server/discover` (servers MUST implement), plus per-request `io.modelcontextprotocol/clientCapabilities` | High. A server reading capabilities from a remembered handshake reads nothing |
| Results had no discriminator | Every result MUST carry `resultType`: `"complete"` or `"input_required"` | Medium. Clients treat a missing field as `"complete"`, so a real MRTR reply gets mis-parsed |
| Server sends `sampling/createMessage`, `elicitation/create`, `roots/list` as requests | MRTR: server returns `InputRequiredResult`, client retries the original request with `inputResponses` | High. The old pattern is explicitly no longer supported |
| Standalone HTTP `GET` SSE stream; `resources/subscribe` / `unsubscribe` | `subscriptions/listen`: one long-lived POST-response stream, client opts into notification types | Medium. A modern-only server SHOULD answer `GET` with `405` |
| `Last-Event-ID` resumption, SSE event ids | Removed. A broken stream loses the in-flight request; the client re-issues with a **new** request id | Medium. Resumption code silently never fires |
| `ping`, `logging/setLevel`, `notifications/roots/list_changed` | Removed from the core protocol | Medium. Kept in SDKs only for legacy sessions |
| Log verbosity set once per session | Per-request `io.modelcontextprotocol/logLevel` in `_meta`. A server MUST NOT emit `notifications/message` for a request that omitted it | Medium. Log notifications stop arriving and nothing reports an error |
| List results were plain | `tools/list`, `prompts/list`, `resources/list`, `resources/templates/list`, `resources/read`, `server/discover` MUST carry `ttlMs` + `cacheScope` | Low. Clients default to "immediately stale" and re-fetch every time |
| Streamable HTTP POST carried no routing metadata | `Mcp-Method` + `Mcp-Name` headers REQUIRED, validated against the body; mismatch is `400` + `-32020` | High on HTTP. A gateway routing on headers and a server executing the body is the vulnerability this closes |
| Tasks were experimental core | The `io.modelcontextprotocol/tasks` extension. `tasks/list` and `tasks/result` are gone | Medium. No compatibility shim |
| Resource-not-found was `-32002` | `-32602` (Invalid Params). Accept `-32002` inbound from older servers | Low |

## Deprecated, Not Yet Removed

Still in the spec, still functional. New code SHOULD NOT adopt them. The removal clocks differ per feature, so read the column rather than assuming one date.

| Feature | Migrate to | Earliest removal |
|---|---|---|
| Roots | Directories or files as tool parameters, resource URIs, or server configuration | First revision on or after 2027-07-28 |
| Sampling | The LLM provider's API directly | First revision on or after 2027-07-28 |
| Logging | `stderr` on stdio; OpenTelemetry for structured observability | First revision on or after 2027-07-28 |
| OAuth Dynamic Client Registration | Client ID Metadata Documents | First revision on or after 2027-07-28 |
| `includeContext: "thisServer"` / `"allServers"` | Omit the field, or `"none"` | Follows Sampling |
| HTTP+SSE transport (the `2024-11-05` one) | Streamable HTTP | **Three months after SEP-2596 reaches Final**, which may already have elapsed |

The specification now runs a formal feature lifecycle (Active, Deprecated, Removed) with a minimum twelve-month deprecation window and a published registry, so a feature disappearing without notice is no longer the failure mode. Checking the registry before adopting anything is.

## Files

Load the one matching the task. Do not load them all.

| Task touches | File |
|---|---|
| Wire shapes: `_meta` keys, `server/discover`, `resultType`, error codes, HTTP headers, caching, subscriptions, transports | `references/wire.md` |
| Sampling, elicitation, roots, `InputRequiredResult`, `requestState` and its security | `references/mrtr.md` |
| Porting an existing server or client, supporting both eras, what breaks silently | `references/migrate.md` |
| Which SDK version speaks which revision, per-SDK API shape, how to smoke-test a built server | `references/sdks.md` |

## What This Skill Does Not Cover

- **Server design**: which tools to expose, how to carve a large API surface, deployment model, bundling for local install. That is a product question, and the official `mcp-server-dev` plugin (`anthropics/claude-plugins-official`) runs a discovery interview for it. Check its pinned versions before trusting its protocol claims; as of 2026-08 its version-pin file records the MCP spec claims as last verified 2026-03, which is the `2025-11-25` era.
- **MCP Apps / UI widgets** beyond how the extension is negotiated.
- **Authorization in depth.** The revision tightened OAuth (issuer validation, credentials keyed by issuer, `application_type` on registration, Client ID Metadata Documents over DCR). `references/migrate.md` lists what changed; the auth spec pages are the authority.

## Live Docs on Demand

The spec ships agent-readable markdown: append `.md` to any spec URL.

| Need | URL |
|---|---|
| Page index | `https://modelcontextprotocol.io/llms.txt` |
| Revision changelog | `https://modelcontextprotocol.io/specification/2026-07-28/changelog.md` |
| Statelessness, `_meta`, error codes | `.../specification/2026-07-28/basic/index.md` |
| Version negotiation, extensions, dual-era matrix | `.../specification/2026-07-28/basic/versioning.md` |
| Deprecated-features registry | `.../specification/2026-07-28/deprecated.md` |
| Full schema reference | `.../specification/2026-07-28/schema.md` |

Fetch the schema page before asserting any field name. Field names in this skill were read from the spec; field names in a model's memory were not.
