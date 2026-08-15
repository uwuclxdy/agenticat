# SDKs and Verification

## Where "MCP 3.0" Comes From

The specification has no semantic version. It uses dates: `2024-11-05`, `2025-03-26`, `2025-06-18`, `2025-11-25`, `2026-07-28`. Nothing official calls the stateless change "MCP 3.0".

"3.0" is the **Rust** SDK. `rmcp` went `2.2.0` → `3.0.0` on 2026-07-28, the same day the spec landed. Every other SDK numbered its stateless rework differently: TypeScript, Python, and C# all shipped a "v2". So "MCP went stateless (3.0)" telescopes two facts into one label, and "3.0" only identifies the release if you are on Rust.

## Version Snapshot

Read on **2026-08-09** from each registry's own API. Versions rot; re-check before pinning.

| SDK | Latest | Released | Speaks `2026-07-28`? | Verified how |
|---|---|---|---|---|
| Rust `rmcp` | **3.1.2** (3.0.0 first shipped it) | 3.1.2: 2026-08-07; 3.0.0: 2026-07-28 | Yes, alongside `2025-11-25` | crates.io API |
| TypeScript `@modelcontextprotocol/server` + `/client` | **2.0.0** each | 2026-07-27 | Yes | npm registry |
| TypeScript `@modelcontextprotocol/sdk` (the old single package) | **1.30.0**, frozen | 2026-07-27 | Legacy path | npm registry |
| Python `mcp` | **2.0.0** | 2026-07-28 | Yes, plus legacy back-compat | PyPI API |
| C#/.NET `ModelContextProtocol` | **2.1.0** (2.0.0 first shipped it) | 2.1.0: 2026-08-05 | Yes, stateless by default | NuGet flat container |
| Go `github.com/modelcontextprotocol/go-sdk` | **v1.7.0** | 2026-07-27 | Opt-in (`Stateless=true`) | Go module proxy |
| Java | v2.0.0 (2026-06-11) | | Reported `2025-11-25` only | Secondary source, unverified here |
| Kotlin, Ruby, PHP, Swift | 0.15.0 / v1.1.0 / v0.7.0 / 0.12.1 | | Only Ruby reported as supporting it | Secondary source, unverified here |

Re-check with the registry, not a changelog page:

```sh
curl -s https://crates.io/api/v1/crates/rmcp | jq -r .crate.max_stable_version
curl -s https://registry.npmjs.org/@modelcontextprotocol%2Fserver | jq -r '.["dist-tags"].latest'
curl -s https://pypi.org/pypi/mcp/json | jq -r .info.version
curl -s https://proxy.golang.org/github.com/modelcontextprotocol/go-sdk/@latest
curl -s https://api.nuget.org/v3-flatcontainer/modelcontextprotocol/index.json | jq -r '.versions[-1]'
```

**Upgrading the dependency is not the same as speaking the new revision.** TypeScript and Go need an explicit opt-in. Python and C# flip on upgrade. Rust needs the version selected by hand, see below. Confirm with a live handshake, never with a version number.

## Rust (`rmcp` 3.x)

Migration guide: `github.com/modelcontextprotocol/rust-sdk` discussions, "Upgrading to RMCP 3.x". MSRV is 1.88.

**The trap:** in 3.1.2, `ProtocolVersion::LATEST` still resolves to `V_2025_11_25`. A server's advertised versions come from `ServerHandler::supported_protocol_versions()`, which defaults to `ProtocolVersion::KNOWN_VERSIONS` (all five, `2026-07-28` included). The `protocol_version` field on `ServerInfo` is only the FALLBACK `initialize` negotiation returns when the client asks for a revision the SDK does not know, so pinning it to `V_2026_07_28` answers a legacy client with a revision it cannot speak. Leave it at the default; narrow `supported_protocol_versions` for a modern-only server.

| Area | 2.x | 3.x |
|---|---|---|
| `ServerHandler::call_tool` / `get_prompt` / `read_resource` | `Result<XResult, ErrorData>` | `Result<XResponse, ErrorData>`; wrap existing results with `.into()` |
| `ServerResult` | no input-required variant | new `InputRequiredResult` variant; exhaustive matches need an arm |
| Protocol union enums | exhaustive | `#[non_exhaustive]`; downstream matches need a wildcard arm |
| Server results | no discriminator | `result_type: Option<ResultType>`, emitted for `2026-07-28`+, cleared for legacy peers |
| List + read results | plain | `ttl_ms: Option<u64>`, `cache_scope: Option<CacheScope>`; builders `.with_ttl_ms()` / `.with_cache_scope()` |
| `StreamableHttpService<S, M>` | `S: Service<RoleServer>` | `S: ServerHandler`, so it can read tool schemas for `Mcp-Param-*` validation |
| `StreamableHttpServerConfig` | `stateful_mode` | `legacy_session_mode`; `2026-07-28` requests are always stateless regardless |
| Client startup | `serve()` only | `serve_with_lifecycle` + `ClientLifecycleMode::{Initialize, Discover, Auto}`; `serve()` still means legacy |
| Discovery | none | `DiscoverRequest`/`DiscoverResult`; `ServerHandler::discover` defaults from `get_info()` |
| Subscriptions | `subscribe()` / `unsubscribe()` | `listen(SubscriptionFilter)`; servers add `accepted_subscription_filter` and `listen` |
| Tasks | experimental core, `#[task_handler]` | `io.modelcontextprotocol/tasks` extension, `TaskManager`, no shim |
| `_meta` types | one `Meta` | `MetaObject` / `RequestMetaObject` / `NotificationMetaObject` |
| `Annotations.last_modified` | `Option<DateTime<Utc>>` | `Option<String>`; parse explicitly if you need a timestamp |
| `structured_content` | `Option<JsonObject>` | `Option<Value>`; use `.as_object()` where you assumed an object |
| OAuth startup | positional `start_authorization` | `AuthorizationRequest` builder; `discover_metadata` → `resolve_metadata` |

Users of `#[tool_router]` + `#[tool_handler]` get the return-type change for free; individual `#[tool]` methods keep compiling. Manual `ServerHandler` impls carry the whole diff.

`requestState` integrity has SDK support: the opt-in `request-state` feature provides `RequestStateCodec` (HMAC-SHA256) with associated-data and TTL binding. Use it rather than hand-rolling.

**Gotchas that survive the version bump** (each cost a real debug cycle; verified against `rmcp` 3.1.2, 2026-08-09):

| Area | Note |
|---|---|
| Runtime timer | A current-thread Tokio runtime built without `.enable_all()` (or `.enable_time()`) panics mid-session: the service loop arms a timer. It dies right *after* the first reply, so a green build and unit tests never see it. `enable_io` alone is not enough |
| `capabilities` | An overridden `get_info` that passes an empty capabilities object makes a conforming client expose **zero tools**, even though a forced `tools/list` still answers. Pass `ServerCapabilities::builder().enable_tools().build()` |
| List-changed pushes | A push is a silent no-op unless the server advertised `listChanged`. Clients register the handler only behind that flag |
| Structured content | Some clients render `structuredContent` only and drop text blocks. Sending both is the spec's back-compat pattern; do not empty `content` to "save tokens", it buys nothing and breaks clients that ignore structured output |
| stdout discipline | The stdio transport owns stdout for framing. Any `println!` outside a frame corrupts the protocol. Route logging and spinners to stderr, through an `EPIPE`-tolerant writer so a reader that left cannot panic the server |
| Server identity | The default build-env `Implementation` reports the *SDK's* name and version to clients. Set your own crate name and version |

## TypeScript

The single `@modelcontextprotocol/sdk` package split into `@modelcontextprotocol/server` and `@modelcontextprotocol/client`, both at 2.0.0. The old package is frozen at 1.30.0 and is the legacy path. A `@modelcontextprotocol/codemod` exists for the v1→v2 source rewrite.

Two things to check before shipping: the handler entry point serves both eras per request, so confirm which one a given request actually took; and the legacy shim for MRTR has no return path for server-to-client requests, so a legacy client can silently lose elicitation. Read the SDK's own "Supporting protocol revision 2026-07-28" migration page rather than inferring from the changelog.

Three traps, each cost a real debug session (measured on `@modelcontextprotocol/server@2.0.0`, independently by two lanes, 2026-08-15): the transport doc's `server.connect(transport)` example is the *hand-constructed* path, and it is broken in the modern direction, not the obvious one. `server/discover` answers `-32601` at HTTP 200, but `tools/list` answers HTTP 200 with a bare `{"tools":[]}` carrying no `resultType`, no `ttlMs`, no `cacheScope`: a legacy-shaped result that reads like a working server. The connect path answers `text/event-stream` where `createMcpHandler` answers `application/json`. Only the `createMcpHandler` entry installs the modern handlers on its per-request instances; for stateless HTTP serving, use `createMcpHandler(() => new McpServer(info, { capabilities: { tools: {} } }), { legacy: 'reject' })`. Second: under `createMcpHandler`, `capabilities: {}` makes `tools/list` answer 404 `-32601`; the "forcing `tools/list` gets an answer" note in the smoke-test section below does not apply to it. Third: `supportedProtocolVersions` is inert on the modern leg (discover and `-32022` answer the modern revision regardless of what you pass), and on the legacy leg it picks WHICH 2025-era revision via `legacyVersions[0] ?? LATEST_PROTOCOL_VERSION`, where `LATEST_PROTOCOL_VERSION` is `"2025-11-25"`. A modern-only list empties `legacyVersions`, and the empty list is exactly what reaches that hardcoded fallback. `legacy: 'reject'` is the whole modern-only guard; the option itself is at best useless.

## Verify With a Live Handshake

A green build proves the code compiles. It proves nothing about the wire. **The old smoke test is now actively wrong**: piping an `initialize` frame tests a method that no longer exists, and a modern server answering it with an error looks identical to a broken server.

For a stdio server, pipe real modern frames in. Note there is no `notifications/initialized`.

```sh
printf '%s\n' \
 '{"jsonrpc":"2.0","id":1,"method":"server/discover","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientInfo":{"name":"smoke","version":"0"},"io.modelcontextprotocol/clientCapabilities":{}}}}' \
 '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{}}}}' \
 | timeout 10 your-server-binary
```

Assert, explicitly, on the `server/discover` result:

- `resultType` is `"complete"`.
- `supportedVersions` contains `2026-07-28`.
- `capabilities` **contains `tools`**, not `{}`. Under `createMcpHandler` a forced `tools/list` with no `tools` capability answers 404 `-32601` (measured 2.0.0, 2026-08-15), so the discovery assert is the only place a missing capability is visible: instructions render, tools never appear.
- `_meta["io.modelcontextprotocol/serverInfo"]` names *your* server, not the SDK.
- `ttlMs` and `cacheScope` are present.
- `instructions` is present if you set any.

Then on `tools/list`: `resultType`, `ttlMs`, `cacheScope`, every tool with its `inputSchema`.
Exit 0, empty stderr.

Negative probes worth adding, because each one catches a whole class. Send these AFTER a valid `server/discover` opener: a `tools/list` with `params: {}` as the first frame establishes no era, and rmcp ends the stdio session with exit 1 instead of returning `-32602`.

```sh
# 1. Missing required _meta -> -32602 (and HTTP 400 on Streamable HTTP)
'{"jsonrpc":"2.0","id":3,"method":"tools/list","params":{}}'
# 2. Bogus version -> -32022 with data.supported
'{"jsonrpc":"2.0","id":4,"method":"tools/list","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"1900-01-01","io.modelcontextprotocol/clientCapabilities":{}}}}'
# 3. Legacy handshake -> an error that NAMES the supported versions
'{"jsonrpc":"2.0","id":5,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}'
```

Optionally call one **read-only** tool to exercise a real body. Never auto-call a mutating or quota-spending tool from a smoke test.

For an HTTP server, the equivalent gate is deploying two instances behind plain round-robin with session affinity off and running the full suite. Any failure there is a hidden session dependency, and it is the only test that actually proves statelessness.

The official conformance suite is the authority beyond this. The MCP Inspector also documents how it negotiates legacy against modern, which is a useful reference when a client and server disagree about eras.

## Server Design Is a Different Question

Deciding which tools to expose, how to carve a large API surface, whether to ship stdio or remote HTTP or a bundle: that is product design, not protocol. The `mcp-server-dev` plugin in `anthropics/claude-plugins-official` runs a discovery interview for it and is a reasonable starting point.

Its protocol claims are stale as of 2026-08. Its own version-pin file records the MCP spec claims as last verified 2026-03, which is `2025-11-25` era, and the material still describes reading `clientInfo` "on initialize". The same holds for the `mcp-builder` skill in `anthropics/skills`, and for the official "Build an MCP server" quickstart on `modelcontextprotocol.io`, which was unchanged by the stateless revision. Take design shape from them; take protocol shape from the spec.
