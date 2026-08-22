# Wire Contract (`2026-07-28`)

Every field name here was read from the spec pages or `schema/2026-07-28/schema.ts`. Anything you need that is absent: fetch `https://modelcontextprotocol.io/specification/2026-07-28/schema.md` rather than guessing a name.

## Statelessness, Stated Normatively

A server processes each request independently. It **MUST NOT** rely on prior requests over the same connection to establish context. It **SHOULD NOT** require that a client reuse the same connection or process for related operations. A client **SHOULD NOT** treat one task, thread, or conversation as the lifetime boundary of a stdio process.

The consequence people miss: **an open stdio process is not a session.** A client may interleave unrelated requests from unrelated conversations on one process. Any per-process map keyed by "the current conversation" is now wrong.

State that must span requests **MUST** be referenced by an explicit identifier the client passes on each request: a server-minted handle, delivered as an ordinary tool parameter or resource URI, not a protocol-level session.

## `_meta` on Requests

`RequestParams._meta` is **non-optional** in the schema. A request missing a required field is malformed: the server **MUST** reject it with `-32602` (Invalid params), and on HTTP with `400 Bad Request`.

| Key | Type | Required | Notes |
|---|---|---|---|
| `io.modelcontextprotocol/protocolVersion` | `string` | **Yes** | e.g. `"2026-07-28"` |
| `io.modelcontextprotocol/clientCapabilities` | `ClientCapabilities` | **Yes** | `{}` means no optional capabilities |
| `io.modelcontextprotocol/clientInfo` | `Implementation` | No | Clients SHOULD send it unless configured not to |
| `io.modelcontextprotocol/logLevel` | `LoggingLevel` | No | **Deprecated in the schema** as of `2026-07-28` (SEP-2577), along with the whole Logging feature. Per-request verbosity; absent means the server **MUST NOT** emit `notifications/message` for that request. New servers log to `stderr` (stdio) or OpenTelemetry instead |
| `progressToken` | opt-in | No | Unprefixed, as before |
| `traceparent`, `tracestate`, `baggage` | W3C strings | No | Unprefixed by deliberate exception, for OpenTelemetry |

Results carry `io.modelcontextprotocol/serverInfo` (`Implementation`, optional, servers SHOULD send). Notifications delivered on a `subscriptions/listen` stream **MUST** carry `io.modelcontextprotocol/subscriptionId` so the client can correlate them.

Both `clientInfo` and `serverInfo` are self-reported and unverified. Implementations **SHOULD NOT** branch on them and **SHOULD NOT** use them for security decisions.

**Key naming**: an optional reverse-DNS prefix plus a name. Any prefix whose second label is `modelcontextprotocol` or `mcp` is reserved (`io.modelcontextprotocol/`, `dev.mcp/`, `com.mcp.tools/`). `com.example.mcp/` is *not* reserved, because the second label is `example`.

If a request needs a capability the client did not declare, the server **MUST** return `MissingRequiredClientCapabilityError` (`-32021`) with `data.requiredCapabilities` listing what is missing. HTTP status `400`.

## `resultType`

```ts
export type ResultType = "complete" | "input_required" | string;
```

Open string type. Every result **MUST** carry it. Rules:

- `"complete"`: final content.
- `"input_required"`: an `InputRequiredResult`, see `mrtr.md`.
- Extensions **MAY** add values, but only ones advertised through capabilities.
- A value the client does not recognize **MUST** be treated as invalid.
- **Absent** means an earlier-revision server. Clients **MUST** read it as `"complete"`.

## `server/discover`

Servers **MUST** answer it. Clients **MAY** call it. It negotiates nothing: it is a convenience read of identity plus capabilities, and on stdio it is the era probe.

```json
{ "jsonrpc": "2.0", "id": "discover-1", "method": "server/discover",
  "params": { "_meta": {
    "io.modelcontextprotocol/protocolVersion": "2026-07-28",
    "io.modelcontextprotocol/clientInfo": { "name": "ExampleClient", "version": "1.0.0" },
    "io.modelcontextprotocol/clientCapabilities": {} } } }
```

```json
{ "jsonrpc": "2.0", "id": "discover-1", "result": {
    "resultType": "complete",
    "supportedVersions": ["2026-07-28"],
    "capabilities": { "tools": {}, "resources": {} },
    "_meta": { "io.modelcontextprotocol/serverInfo": { "name": "ExampleServer", "version": "1.0.0" } },
    "instructions": "This server provides weather and resource utilities.",
    "ttlMs": 3600000, "cacheScope": "public" } }
```

`instructions` moved here. It used to ride on `InitializeResult`; a server that only sets it on the old handshake path now ships no instructions at all.

## Version Negotiation

No handshake. Each request declares its version and the server accepts or rejects that request on its own.

```json
{ "jsonrpc": "2.0", "id": 1, "error": {
    "code": -32022, "message": "Unsupported protocol version",
    "data": { "supported": ["2026-07-28", "2025-11-25"], "requested": "1900-01-01" } } }
```

The client **SHOULD** pick a mutually supported version from `supported` and retry, or surface an error. A modern-only server **SHOULD** name its supported versions in whatever error it returns to an `initialize` request on any transport: a legacy client has no fall-forward path, so that message may be the only diagnostic a user ever sees.

## Error Codes

`-32000` to `-32019` is legacy and implementation-defined; new code **SHOULD NOT** allocate there. `-32020` to `-32099` belongs to the spec.

| Code | Name | Raised when |
|---|---|---|
| `-32020` | `HeaderMismatch` | HTTP header disagrees with the body, or a required header is missing or malformed |
| `-32021` | `MissingRequiredClientCapability` | The request needs a capability the client did not declare |
| `-32022` | `UnsupportedProtocolVersion` | Server does not speak the requested revision |
| `-32602` | Invalid params | Missing required `_meta` fields; also resource-not-found, which moved off `-32002` |
| `-32601` | Method not found | Unknown RPC. On HTTP this pairs with `404 Not Found` |

Reserved and **MUST NOT** be emitted by a `2026-07-28` implementation: `-32002` (old resource-not-found; still accepted inbound from older servers) and `-32042` (URL elicitation required, `2025-11-25` only).

## Streamable HTTP

One endpoint, POST only.

**Security, before anything else.** Servers **MUST** validate the `Origin` header on all incoming connections to prevent DNS rebinding, and **MUST** answer `403 Forbidden` when a present `Origin` is invalid. A local server **SHOULD** bind to `127.0.0.1` only, never `0.0.0.0`. Servers **SHOULD** authenticate all connections. This predates the stateless revision and is the control most often skipped in a from-memory implementation.

**Client request rules.** Every JSON-RPC message is a new POST. The client **MUST** send an `Accept` header listing **both** `application/json` and `text/event-stream`, because the server chooses per request which one it answers with and the client **MUST** support both. The body is a single JSON-RPC request or notification; a client **MUST NOT** send JSON-RPC responses.

**Required request headers.** `MCP-Protocol-Version` must equal the body's `_meta` value. `Mcp-Method` carries the JSON-RPC method on all requests. `Mcp-Name` carries `params.name` or `params.uri` on `tools/call`, `resources/read`, and `prompts/get`. Optional `Mcp-Param-{Name}` headers mirror tool arguments annotated `x-mcp-header`.

Values that cannot be plain ASCII use the sentinel `=?base64?{Base64EncodedValue}?=`. This applies to `Mcp-Name` as well, since tool and prompt names are only SHOULD-constrained to header-safe characters.

**Header/body validation is mandatory and is a security control.** A server **MUST** reject a mismatch with `400` plus `-32020`. The attack it closes: a gateway routing or rate-limiting on the header while the server executes the body. Integer comparisons **SHOULD** be numeric, so `42.0` equals `42`.

`x-mcp-header` constraints, all MUST: non-empty, HTTP field-name token syntax, no CR/LF, case-insensitively unique within one `inputSchema`, primitive types only (`integer`, `string`, `boolean`, never `number`), and statically reachable from the schema root through `properties` keys alone. No `items`, no `oneOf`/`anyOf`/`allOf`/`not`, no `if`/`then`/`else`, no `$ref`. A client on Streamable HTTP **MUST** drop a tool whose annotation violates any of these from its `tools/list` result and SHOULD log why. stdio clients **MAY** ignore `x-mcp-header` entirely.

**Status codes.**

| Situation | Response |
|---|---|
| Present but invalid `Origin` | `403 Forbidden` (**MUST**) |
| JSON-RPC notification accepted | `202 Accepted`, no body |
| JSON-RPC request | `200` with `application/json` or `text/event-stream`; clients **MUST** support both |
| Missing/mismatched headers, missing `_meta`, unsupported version, missing capability | `400 Bad Request` plus the JSON-RPC error |
| Unknown RPC method | `404 Not Found` plus `-32601` |
| `GET` or `DELETE` on the endpoint | `405 Method Not Allowed` (SHOULD, in the section on handling older clients) |
| `Mcp-Session-Id` header on a request | Ignore it. Never mint or echo one |
| `Last-Event-ID` header | Ignore it. Streams are not resumable |

**SSE now has exactly two roles.** A per-request response stream (progress and log notifications for that request, terminated by the final response), and the long-lived `subscriptions/listen` stream. A server **MUST NOT** send JSON-RPC *requests* on either.

Servers **SHOULD** set `X-Accel-Buffering: no` on SSE responses so reverse proxies stop buffering. On long-lived listen streams, emit a periodic SSE comment line (`:\r\n`) as a keep-alive; clients must ignore comment lines.

**Cancellation on HTTP is closing the stream.** This revision defines no client-to-server notifications over Streamable HTTP. `notifications/cancelled` is the stdio mechanism.

## stdio

Framing is unchanged: one newline-delimited JSON-RPC message per line, no embedded newlines, `stderr` free for logging, nothing but valid MCP messages on `stdout`. There is no header layer, so all metadata rides in `params._meta`.

What changed for a stdio server:

- Answer `server/discover`.
- Put `resultType` on every result.
- Put `ttlMs` and `cacheScope` on the six cacheable results.
- **Stop writing JSON-RPC requests to stdout.** Sampling, elicitation, and roots become `InputRequiredResult` replies.
- Keep honoring `notifications/cancelled`; on stdio there is no per-request stream to close.
- Exit promptly on stdin EOF. That is the primary graceful-shutdown signal and the only portable one.
- On unexpected server exit the client restarts the process and retries; in-flight requests are simply lost, and active `subscriptions/listen` streams must be re-established.

The wire format also works unchanged over Unix domain sockets or TCP. Custom transports **SHOULD** reuse this framing and only supply channel-specific equivalents for launch, `stderr`, shutdown, and restart.

## Caching

Servers **MUST** put `ttlMs` and `cacheScope` on `"complete"` results of six operations: `server/discover`, `tools/list`, `prompts/list`, `resources/list`, `resources/templates/list`, `resources/read`.

- `ttlMs`: integer milliseconds, **MUST** be `>= 0`. `0` means immediately stale. Absent means clients assume `0`, which should only happen against an older server. Negative is ignored and treated as `0`.
- `cacheScope`: `"public"` or `"private"`. `"public"` means the response holds no user-specific data, so any client, shared gateway, or proxy **MAY** store it and serve it to any user. `"private"` means a cached copy **MAY** be reused within the same authorization context and **MUST NOT** be shared across authorization contexts. A different access token requires a different cache. That binds client-side caches too, not only intermediaries.

The cache key is the method plus the parameters that affect the result (`uri` for `resources/read`, `cursor` for a paginated list). Results produced by an MRTR retry, meaning anything carrying `inputResponses` or `requestState`, **MUST NOT** be cached.

TTL is a freshness hint, not a polling interval. Clients **SHOULD NOT** background-refetch on expiry; they check freshness at use time. Any client that does poll **MUST** jitter and back off. Caching and `listChanged` notifications coexist: a notification invalidates immediately.

Servers **SHOULD** return tools from `tools/list` in a deterministic order, which lets clients cache and improves LLM prompt-cache hit rates.

## Subscriptions

`subscriptions/listen` replaces the standalone HTTP `GET` stream and both `resources/subscribe` and `resources/unsubscribe`. One long-lived request whose response is the notification stream.

The client opts into specific types: `toolsListChanged`, `promptsListChanged`, `resourcesListChanged`, `resourceSubscriptions`. The server acknowledges and tags every notification with `io.modelcontextprotocol/subscriptionId` in `_meta`.

Request-scoped notifications (`notifications/progress`, `notifications/message`) do **not** travel on the listen stream. They flow on the response stream of the request they belong to.

## Extensions

Capabilities gained an `extensions` field on both sides: a map of extension identifier to a settings object. Identifiers follow the `_meta` key naming rules and the prefix is mandatory.

```json
{ "capabilities": { "tools": {},
    "extensions": { "io.modelcontextprotocol/tasks": {} } } }
```

```json
{ "capabilities": { "roots": {},
    "extensions": { "io.modelcontextprotocol/ui": { "mimeTypes": ["text/html;profile=mcp-app"] } } } }
```

An empty settings object means "supported, no settings". When one side supports an extension and the other does not, the supporting side **MUST** either fall back to core behavior or reject with an appropriate error. An extension **SHOULD** document its own fallback.

Tasks moved out of core into `io.modelcontextprotocol/tasks`: a server may answer `tools/call` with a task handle, and the client drives `tasks/get` (polling), `tasks/update`, and `tasks/cancel`. `tasks/list` and the blocking `tasks/result` are gone, and there is no compatibility shim. On Streamable HTTP a client **MUST** set `Mcp-Name` to `params.taskId` for `tasks/get`, `tasks/update`, and `tasks/cancel`, so intermediaries can route follow-ups to the instance holding that task.

## Schema Relaxations

`inputSchema` and `outputSchema` now accept any JSON Schema 2020-12 keywords, and `outputSchema` accepts non-object root types. `structuredContent` accepts any JSON value, not only an object. `$ref` resolution requirements and composition-keyword resource bounds are specified. Input schemas still require `type: "object"` at the root in practice; check the tools page before relying on anything else.

## Known Source Discrepancies

Reconciled 2026-08. Where two official pages disagree, the schema wins.

| Discrepancy | Resolution |
|---|---|
| The revision changelog omits `server/discover` from the cacheable-results list | The schema and the caching page both include it. Treat it as cacheable |
| The launch blog post's example request omits both required `_meta` fields | The example is non-compliant. Do not copy it |
| SEP-2575 text still says `messages/listen` | The shipped method is `subscriptions/listen` |
