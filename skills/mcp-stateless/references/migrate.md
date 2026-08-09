# Migrating

For a server or client written against `2025-11-25` or earlier. The spec calls the two sides
**modern** (per-request metadata, `2026-07-28` and later) and **legacy** (`initialize`
handshake, `2025-11-25` and earlier). An implementation supporting both is **dual-era**.

## Pick a Posture First

| Posture | When it fits | Cost |
|---|---|---|
| Dual-era, one endpoint | Public server with users you cannot upgrade | Two code paths, two test matrices. A dual-era server **MAY** serve both eras on one endpoint or process |
| Modern endpoint + a separate legacy endpoint | You need a genuinely sessionful legacy deployment kept intact | Two deployments |
| Hard cutover | Private server, you control every client | Cheapest. Legacy clients get a hard failure with no fall-forward path |

A dual-era **server** picks its behavior from how the client opens. A request carrying modern
per-request `_meta` gets served statelessly. An `initialize` request selects legacy semantics
scoped to the stdio process or the HTTP session.

## Compatibility Matrix

| Client | Server | Outcome |
|---|---|---|
| Modern | Modern | Works. `server/discover` optional; mismatches surface as `-32022` and the client retries |
| Modern | Legacy | **Fails.** The server may error, stay silent, or process an era-ambiguous method under legacy semantics |
| Dual-era | Modern | Works. The client stays modern |
| Dual-era | Legacy | Works. The client falls back to `initialize` |
| Legacy | Modern | **Fails.** Legacy clients have no fall-forward mechanism |
| Legacy | Dual-era | Works, on the negotiated legacy revision |

**The worst cell is "Modern client, Legacy server", and it is worse than the table suggests.**
A legacy server that never gated on `initialize` will happily process a modern `tools/call`
under legacy semantics, ignoring the `_meta` envelope entirely. That is a wrong answer, not
an error. It is why the spec RECOMMENDs probing even for a modern-only client.

## Era Detection

**stdio**: send `server/discover` first, with your preferred modern version in `_meta`.

| Probe outcome | Verdict |
|---|---|
| A `DiscoverResult` | Modern. Pick a mutually supported version and continue |
| A recognized modern error such as `-32022` | Modern, wrong version. Retry from its `supported` list. **Do not fall back** |
| Any other error, or no response within a timeout | Legacy. Fall back to `initialize` |

The fallback **MUST NOT** key on one specific error code. Legacy servers answer unknown
pre-`initialize` requests with implementation-defined codes, commonly `-32601` or `-32602`,
or with nothing.

**Streamable HTTP**: attempt a modern request. On `400 Bad Request`, inspect the body before
falling back, because modern servers also use `400` for `-32022`, `-32021`, and header
validation failures. A recognized modern JSON-RPC error means modern. An empty or
unrecognized body means legacy.

Era is a property of the server, not of one request. Cache it for the lifetime of the process
(stdio) or origin (HTTP), optionally persist it across restarts of the same configuration,
and re-probe if the cached assumption later fails.

A modern-only server **SHOULD** name its supported versions in whatever error it returns to
an `initialize` request. That error message is often the only diagnostic a legacy client's
user will ever see.

## Server Checklist

**Wire**

- [ ] Answer `server/discover`. Advertise supported versions, capabilities, identity in
      result `_meta`, and `instructions`.
- [ ] Move `instructions` off the old `InitializeResult` path or it ships nowhere.
- [ ] Read protocol version, capabilities, and identity from `params._meta` on every request.
      Stop requiring `initialize`.
- [ ] Missing required `_meta` → `-32602`, HTTP `400`.
- [ ] Unsupported version → `-32022` with `data.supported`, HTTP `400`.
- [ ] Unknown method → `-32601`, HTTP `404`.
- [ ] Needed capability not declared → `-32021` with `data.requiredCapabilities`, HTTP `400`.
- [ ] Add `resultType` to every result.
- [ ] Add `ttlMs` and `cacheScope` to the six cacheable results.
- [ ] Return `tools/list` in a deterministic order.
- [ ] HTTP only: validate `MCP-Protocol-Version`, `Mcp-Method`, `Mcp-Name` against the body,
      decoding the `=?base64?…?=` sentinel first; mismatch → `400` + `-32020`.
- [ ] HTTP only: validate the `Origin` header on every connection and answer `403` when a
      present one is invalid; bind local servers to `127.0.0.1`. Predates this revision and is
      the control most often missing from a from-memory server.
- [ ] HTTP only: `405` on `GET`/`DELETE` (SHOULD); ignore `Mcp-Session-Id` and `Last-Event-ID`.
- [ ] Renumber resource-not-found from `-32002` to `-32602`. Never allocate in
      `-32000`..`-32019`.

**State**

- [ ] Grep every read and write keyed on a session id: caches, per-conversation config,
      workflow progress, rate-limit buckets, auth context.
- [ ] Convert multi-call flows to server-minted handles passed as ordinary tool arguments.
- [ ] Stop treating one connection as one conversation. This binds stdio too, not only HTTP.

**MRTR**

- [ ] Replace every server-initiated request with `InputRequiredResult`. Details and the
      security rules are in `mrtr.md`.
- [ ] Integrity-protect `requestState`.

**Notifications and logging**

- [ ] Implement `subscriptions/listen`: acknowledge with a `subscriptionId`, tag every
      notification, never send a type the client did not opt into, close gracefully.
- [ ] Keep `notifications/progress` and `notifications/message` on their own request's
      response stream.
- [ ] Drop `logging/setLevel`. Read `io.modelcontextprotocol/logLevel` per request and emit
      **nothing** when it is absent.
- [ ] Drop `ping` and `notifications/roots/list_changed`.

**Schemas, tasks, auth, extensions**

- [ ] Validate tool schemas against JSON Schema 2020-12. Never auto-dereference a network
      `$ref`; bound depth and subschema count.
- [ ] Move off the experimental tasks API to the `io.modelcontextprotocol/tasks` extension.
      `tasks/list` and the blocking `tasks/result` are gone with no shim.
- [ ] Declare supported extensions in the `extensions` capability map.

**Verify**

- [ ] Run behind two or more instances with plain round-robin and **no** session affinity.
      Any failure is a hidden session dependency.
- [ ] Run the official conformance suite.
- [ ] Check what your gateway does with unknown `Mcp-*` headers before the first deploy.

## Client Checklist

- [ ] Put `io.modelcontextprotocol/protocolVersion` and `clientCapabilities` in `_meta` on
      every request. Both are required; a missing one is a malformed request.
- [ ] Send `clientInfo` unless configured otherwise.
- [ ] Handle `-32022` by retrying from `data.supported`.
- [ ] Treat an absent `resultType` as `"complete"`.
- [ ] Handle `input_required`: fulfill `inputRequests`, echo `requestState` byte-for-byte,
      retry the original request with a **new** JSON-RPC id.
- [ ] HTTP only: send an `Accept` header listing **both** `application/json` and
      `text/event-stream`, and handle either response type. This is a MUST and is easy to
      miss, since the old single-package clients set it for you.
- [ ] HTTP only: send `MCP-Protocol-Version`, `Mcp-Method`, `Mcp-Name`, and mirror
      `x-mcp-header` parameters into `Mcp-Param-*`. Reject and drop tools whose
      `x-mcp-header` annotations violate the constraints.
- [ ] Honor `ttlMs` and `cacheScope`. Never cache a result from a request carrying
      `inputResponses` or `requestState`. Partition private entries by authorization context.
- [ ] Replace `resources/subscribe` and the standalone `GET` stream with
      `subscriptions/listen`; correlate on `io.modelcontextprotocol/subscriptionId`.
- [ ] Drop resumption logic. Re-issue a lost request with a new id.
- [ ] Dual-era only: probe once per server and cache the verdict.

## What Breaks Silently

The failures that produce a wrong answer or an empty result rather than an error.

| Pattern | Symptom |
|---|---|
| Per-session cache keyed on `Mcp-Session-Id` | The header is gone, so every request looks like the same (empty) key. One tenant's data served to another |
| Per-process state treated as per-conversation | A client interleaves two conversations on one stdio process and they read each other's state |
| A legacy server that never gated on `initialize` | Processes a modern `tools/call` under legacy semantics, ignoring `_meta`. Wrong answer, no error |
| `instructions` set only on `InitializeResult` | The server ships no instructions at all under the modern path |
| Capabilities read from a remembered handshake | Reads nothing. Downstream feature gates all evaluate false |
| Log level never read from `_meta` | Log notifications stop arriving; nothing errors |
| `Last-Event-ID` resumption code | Never fires. Looks like it works until a stream actually breaks |
| Waiting for the MRTR retry on the same JSON-RPC id | Hangs forever. The retry uses a new id |
| Accumulating `inputResponses` across rounds | Round three sees only round three's answers |
| A gateway routing on `Mcp-Name` against a server that skips header validation | Requests execute against a body the router never saw. This is the vulnerability header validation exists to close |

## Authorization Changes

Smaller than the protocol break, still mandatory reading before shipping a remote server.

- Authorization servers **SHOULD** include `iss` in authorization responses (RFC 9207), and
  clients **MUST** validate a present `iss` against the recorded issuer before redeeming the
  code.
- Clients **MUST** key persisted credentials by issuer identifier, **MUST NOT** reuse them
  with a different authorization server, and **MUST** re-register when it changes.
- Clients **MUST** specify an `application_type` during Dynamic Client Registration, to avoid
  OpenID Connect redirect-URI conflicts.
- Dynamic Client Registration itself is now deprecated in favor of Client ID Metadata
  Documents. DCR stays available for authorization servers that lack CIMD.
- Publish RFC 9728 protected-resource metadata. Where it supplies a `resource` value, that
  becomes the RFC 8707 resource indicator, which can change the audience of issued tokens.

An SDK's auth hardening may be opt-in. Upgrading the dependency does not by itself make a
server conformant; check the SDK's own migration notes.

## The Deprecation Clock

SEP-2596 established the feature lifecycle (Active, Deprecated, Removed) with a minimum
twelve-month window and a published registry. SEP-2577 is what deprecated Roots, Sampling,
and Logging *under* that policy. The two get conflated in secondary coverage; the registry
page is the canonical view.

Roots, Sampling, Logging, and Dynamic Client Registration all became eligible for removal in
the first revision released on or after **2027-07-28**. Nothing has been removed under the
policy yet.

The HTTP+SSE transport is the outlier: its clock reads "three months after SEP-2596 reaches
Final", which may already have elapsed. Verify that date directly if HTTP+SSE matters to you.

## Do Not Code Against the Blog Posts

Several widely-cited launch and migration posts print field shapes that disagree with the
spec, including `"inputRequired"` for `"input_required"` and a `{type, message, schema}`
shape for `inputRequests` values where the spec has `{method, params}`. The official launch
post's own example request omits both required `_meta` fields. Take shapes from the schema.
