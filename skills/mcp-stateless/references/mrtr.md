# Multi Round-Trip Requests

The one change most likely to be written wrong from memory. Under `2026-07-28` a server **MUST NOT** send JSON-RPC requests. Sampling, elicitation, and roots all invert: the server answers the client's request with "I need more input", the client gathers it, the client sends the request again.

> Servers **MUST** send server-to-client requests (such as `roots/list`, > `sampling/createMessage`, or `elicitation/create`) using the MRTR pattern. The previous > pattern of server-initiated requests is no longer supported. This is a breaking change.

## Where It Applies

Exactly three client requests may be answered with an `InputRequiredResult`. In the schema, their params types extend `InputResponseRequestParams`, and nothing else does.

| Request | May return `input_required` |
|---|---|
| `tools/call` | Yes |
| `prompts/get` | Yes |
| `resources/read` | Yes |
| everything else | **No** |

## The Shapes

`InputRequiredResult` is a **result**, not a request:

```ts
export interface InputRequiredResult extends Result {
  inputRequests?: InputRequests;   // map: server-assigned key -> request object
  requestState?: string;           // opaque to the client
}
```

At least one of the two **MUST** be present. `requestState` alone is legal and is the load-shedding case: "come back with the same question, here is where I got to."

```json
{ "jsonrpc": "2.0", "id": 1, "result": {
    "resultType": "input_required",
    "inputRequests": {
      "github_login": { "method": "elicitation/create",
        "params": { "mode": "form", "message": "Please provide your GitHub username",
          "requestedSchema": { "type": "object",
            "properties": { "name": { "type": "string" } }, "required": ["name"] } } },
      "capital_of_france": { "method": "sampling/createMessage",
        "params": { "messages": [ { "role": "user",
            "content": { "type": "text", "text": "What is the capital of France?" } } ],
          "systemPrompt": "You are a helpful assistant.", "maxTokens": 100 } }
    },
    "requestState": "AEAD-protected blob" } }
```

Values of `inputRequests` **MUST** be one of `ElicitRequest`, `CreateMessageRequest`, or `ListRootsRequest`. Keys are server-assigned and **MUST** be unique within one request.

The retry carries `inputResponses` and `requestState` as **siblings of `arguments`** inside `params`, keyed identically:

```json
{ "jsonrpc": "2.0", "id": 2, "method": "tools/call",
  "params": {
    "name": "open_pr",
    "arguments": { "repo": "octocat/hello" },
    "inputResponses": {
      "github_login": { "action": "accept", "content": { "name": "octocat" } },
      "capital_of_france": { "role": "assistant",
        "content": { "type": "text", "text": "The capital of France is Paris." },
        "model": "claude-3-sonnet-20240307", "stopReason": "endTurn" }
    },
    "requestState": "AEAD-protected blob",
    "_meta": { "io.modelcontextprotocol/protocolVersion": "2026-07-28",
               "io.modelcontextprotocol/clientCapabilities": { "elicitation": {}, "sampling": {} } } } }
```

## Rules That Bite

**The retry uses a different JSON-RPC `id`.** The two requests are independent; nothing correlates them except `requestState`. Code that keys an in-memory map on the request id and waits for a second message on the same id will hang forever.

**Do not rely on the client re-sending earlier rounds' answers.** `inputResponses` keys correspond to the `inputRequests` the server just issued; nothing obliges a client to carry round one's answers into round three. Thread anything the server needs across rounds through `requestState`. Extra keys are harmless in the other direction: a server **SHOULD** ignore information in `inputResponses` it does not recognize or need.

**A server MUST NOT ask for something the client did not declare.** No `elicitation` in `clientCapabilities` means no `elicitation/create` in `inputRequests`. The client declares capabilities per request in `_meta`, so read them from the request in hand, never from a remembered handshake. Needing an undeclared capability is `-32021` (`MissingRequiredClientCapability`) with `data.requiredCapabilities`.

**A server MUST NOT assume the client will retry.** The client may abandon the request. A server may also return `InputRequiredResult` repeatedly on successive attempts, which is the sanctioned way to keep prompting until the answer is complete.

**Missing information gets asked for again, not errored.** If the client omitted something necessary, respond with a new `InputRequiredResult` rather than a JSON-RPC error. Unexpected extra keys in `inputResponses` are ignored.

**Cacheability.** Any result produced by a request carrying `inputResponses` or `requestState` **MUST NOT** be cached.

## `requestState` Is Attacker-Controlled

It round-trips through the client, so treat it as untrusted input on the way back in.

Servers **MUST** integrity-protect it (HMAC or AEAD) and **MUST** reject state that fails verification, whenever it influences authorization, resource access, or business logic.
Integrity protection **MAY** be skipped only when tampering can cause nothing worse than the request failing.

To bound replay, servers **SHOULD** put these inside the protected payload and verify each on receipt:

- the authenticated principal, rejecting state presented by a different one;
- a short TTL, rejecting state presented after it lapses;
- an identifier for the originating request (method name plus a digest of its salient parameters), rejecting state presented on a request that does not match.

These bound the replay window and stop cross-user and cross-request reuse. They do **not** give single-use. A `requestState` that must be redeemed at most once (a one-time token, a payment step) needs a server-side consumed-set, which is real state and needs a real store.

## The Three Client Features

| Feature | Status | Notes |
|---|---|---|
| **Elicitation** | Active | Two modes: `form` for structured data, `url` for out-of-band interaction. Servers **MUST NOT** request passwords, API keys, access tokens, or payment credentials via form mode, and **MUST** use URL mode for interactions involving them |
| **Sampling** | **Deprecated** `2026-07-28` | Still functional through MRTR for at least twelve months. New code calls the LLM provider's API directly |
| **Roots** | **Deprecated** `2026-07-28` | Reduced to informational guidance. New code takes paths as tool parameters, resource URIs, or server config |

The deprecation and the channel change are separate facts, and conflating them is a common misread. Roots and sampling are *deprecated*; the mechanism that used to deliver them (server-initiated requests) is *removed*. Even during the deprecation window they only work through MRTR.

**Elicitation lost its completion signal.** `notifications/elicitation/complete` and the `elicitationId` field of URL-mode elicitation requests, both added in `2025-11-25`, are gone.
The client learns the outcome by retrying the original request. A server that needs to correlate a URL-mode elicitation across retries encodes its own identifier in `requestState`.
Error code `-32042` (URL elicitation required) is reserved and **MUST NOT** be emitted.

## Tasks Interact With This

The `io.modelcontextprotocol/tasks` extension has its own input-required state: a task in `input_required` exposes `inputRequests`, and the client answers with `tasks/update` (`{taskId, inputResponses}`) rather than by retrying the original call. A tool call that the server turned into a task does not answer `input_required` on the `tools/call` itself.

Do not mix the two paths in one handler. Decide up front whether a long tool runs synchronously with MRTR rounds or as a task, and branch there.
