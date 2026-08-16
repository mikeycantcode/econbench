# pi Extension API notes

Source: `@earendil-works/pi-coding-agent@0.84.2` (installed in `node_modules`).

## Revision history

- **Rev 2 (current)**: switched from `@mariozechner/pi-coding-agent@0.73.1` to
  `@earendil-works/pi-coding-agent@0.84.2`. The `@mariozechner/*` scope is the
  deprecated/legacy name; the project renamed to the `@earendil-works` scope and the
  maintained package is `@earendil-works/pi-coding-agent` (confirmed on npm: `bin: pi`,
  maintainers include badlogic, description "Coding agent CLI with read, bash, edit,
  write tools and session management", `dist-tags.latest: 0.84.2`). All findings below
  are re-verified against this package. Where Rev 1 (`@mariozechner`) differed or was
  wrong, it's called out explicitly.
- **Rev 1 (superseded)**: originally inspected `@mariozechner/pi-coding-agent@0.73.1`, a
  stale/deprecated package. Its claim that `agent_settled` did not exist was an artifact
  of inspecting an old version — **it exists in the current package** (see below).

Public entry point: `dist/index.d.ts`, re-exporting from `dist/core/extensions/index.d.ts`
(which re-exports `dist/core/extensions/types.d.ts`). Quotes below are from
`node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts` unless
noted otherwise.

Note: this package has its own nested `@earendil-works/pi-ai` and
`@earendil-works/pi-agent-core` (not hoisted to top-level `node_modules` — found under
`node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/`), so any
future direct import of those packages should account for that nesting.

## Extension factory signature

```ts
/** Extension factory function type. Supports both sync and async initialization. */
export type ExtensionFactory = (pi: ExtensionAPI) => void | Promise<void>;
```

**Export convention — confirmed** (this was an open gap in Rev 1): the package ships
real examples under `examples/extensions/*.ts`. Every example uses a **default export**
of a function matching `ExtensionFactory`:

```ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	pi.registerCommand("bookmark", { ... });
}
```

(verified in `examples/extensions/bookmark.ts`). So a `.pi/extensions/*.ts` module
should `export default` its `ExtensionFactory`.

## `ExtensionAPI` shape (`pi` parameter)

Full list of event names registerable via `pi.on(eventName, handler)` in this version
(28 in Rev 1 → **32 in Rev 2**, new ones bolded):

`project_trust`**(new)**, `resources_discover`, `session_start`, `session_before_switch`,
`session_before_fork`, `session_before_compact`, `session_compact`, `session_shutdown`,
`session_before_tree`, `session_tree`, `session_info_changed`**(new)**, `context`,
`before_provider_request`, `before_provider_headers`**(new)**, `after_provider_response`,
`before_agent_start`, `agent_start`, `agent_end`, `agent_settled`**(new — see below)**,
`turn_start`, `turn_end`, `message_start`, `message_update`, `message_end`,
`tool_execution_start`, `tool_execution_update`, `tool_execution_end`, `model_select`,
`thinking_level_select`, `user_bash`, `input`, `tool_call`, `tool_result`.

`ExtensionHandler` type (unchanged from Rev 1):

```ts
export type ExtensionHandler<E, R = undefined> = (event: E, ctx: ExtensionContext) => Promise<R | void> | R | void;
```

Other `ExtensionAPI` members (`registerTool`, `registerCommand`, `registerShortcut`,
`registerFlag`, `getFlag`, `registerMessageRenderer`, `sendMessage`, `sendUserMessage`,
`appendEntry`, `setSessionName`, `getSessionName`, `setLabel`, `exec`, `getActiveTools`,
`getAllTools`, `setActiveTools`, `getCommands`, `setModel`, `getThinkingLevel`,
`setThinkingLevel`, `registerProvider`, `unregisterProvider`, `events`) are present with
the same signatures as Rev 1 documented them (re-checked; no changes found in these
members' signatures between the two package versions).

## `agent_settled` — CONFIRMED TO EXIST (correction from Rev 1)

Rev 1's finding that this event doesn't exist was **wrong for the current/maintained
package** — it was simply absent from the stale `@mariozechner@0.73.1` snapshot. In
`@earendil-works/pi-coding-agent@0.84.2`:

```ts
/** Fired after an agent run has fully settled and no automatic retry, compaction, or queued continuation will run. */
export interface AgentSettledEvent {
    type: "agent_settled";
}

// on ExtensionAPI:
on(event: "agent_settled", handler: ExtensionHandler<AgentSettledEvent>): void;
```

The payload carries **no fields beyond `type`** — it's a pure "settled" signal. Use it
(not `agent_end`) when you need to know the agent loop is fully done, including any
automatic retry/compaction/queued-continuation cycles, not just that one `agent_end`
fired. `agent_end` (`{ type: "agent_end"; messages: AgentMessage[] }`) can fire and still
be followed by more agent activity (e.g. auto-compaction retry) before things truly
settle; `agent_settled` is the terminal signal.

## `turn_end` event payload

Unchanged from Rev 1:

```ts
/** Fired at the end of each turn */
export interface TurnEndEvent {
    type: "turn_end";
    turnIndex: number;
    message: AgentMessage;
    toolResults: ToolResultMessage[];
}
```

Still **no direct token/context-usage field on `TurnEndEvent` itself** — usage lives on
`event.message.usage` when `event.message.role === "assistant"`. `AgentMessage` (from
`@earendil-works/pi-agent-core`, nested `dist/types.d.ts`):

```ts
export type AgentMessage = Message | CustomAgentMessages[keyof CustomAgentMessages];
```

`Message = UserMessage | AssistantMessage | ToolResultMessage` (from
`@earendil-works/pi-ai`, nested `dist/types.d.ts`):

```ts
export interface AssistantMessage {
    role: "assistant";
    content: (TextContent | ThinkingContent | ToolCall)[];
    api: Api;
    provider: ProviderId;
    model: string;
    responseModel?: string;
    responseId?: string;
    diagnostics?: AssistantMessageDiagnostic[];
    usage: Usage;
    stopReason: StopReason;
    deferred?: DeferredHandle;
    errorMessage?: string;
    rawStopReason?: string;
    endTurn?: boolean;
    timestamp: number;
}

export interface Usage {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    /** Subset of `cacheWrite` written with 1h retention. Only Anthropic reports this split. */
    cacheWrite1h?: number;
    /** Reasoning/thinking tokens, when the provider reports them. Subset of `output`. */
    reasoning?: number;
    totalTokens: number;
    cost: {
        input: number;
        output: number;
        cacheRead: number;
        cacheWrite: number;
        total: number;
    };
}
```

Differences from Rev 1's `Usage`/`AssistantMessage`: two new optional `Usage` fields
(`cacheWrite1h`, `reasoning`), and `AssistantMessage` gained `deferred?`, `rawStopReason?`,
`endTurn?`, and `provider` is now typed `ProviderId` (was `Provider`). Field names used
for token accounting (`input`, `output`, `cacheRead`, `cacheWrite`, `totalTokens`, `cost.*`)
are unchanged — safe to use as before.

To read token usage on `turn_end`: narrow `event.message.role === "assistant"`, then read
`event.message.usage.{input,output,cacheRead,cacheWrite,totalTokens}` and
`event.message.usage.cost.{input,output,cacheRead,cacheWrite,total}`.

For live/aggregate context usage (unchanged from Rev 1), `ExtensionContext` exposes:

```ts
export interface ContextUsage {
    tokens: number | null;
    contextWindow: number;
    percent: number | null;
}
getContextUsage(): ContextUsage | undefined;
```

## `ctx.compact` signature — unchanged, confirmed

```ts
export interface CompactOptions {
    customInstructions?: string;
    onComplete?: (result: CompactionResult) => void;
    onError?: (error: Error) => void;
}

// ExtensionContext:
compact(options?: CompactOptions): void;
```

Still fire-and-forget (`void`, not a Promise); completion via `onComplete`/`onError` or
the `session_compact` event.

## `registerTool` shape (incl. TypeBox `parameters`) — unchanged, confirmed

```ts
export interface ToolDefinition<TParams extends TSchema = TSchema, TDetails = unknown, TState = any> {
    name: string;
    label: string;
    description: string;
    promptSnippet?: string;
    promptGuidelines?: string[];
    parameters: TParams;          // TypeBox schema (TSchema from "typebox")
    renderShell?: "default" | "self";
    prepareArguments?: (args: unknown) => Static<TParams>;
    executionMode?: ToolExecutionMode;
    execute(
        toolCallId: string,
        params: Static<TParams>,
        signal: AbortSignal | undefined,
        onUpdate: AgentToolUpdateCallback<TDetails> | undefined,
        ctx: ExtensionContext,
    ): Promise<AgentToolResult<TDetails>>;
    renderCall?: (args: Static<TParams>, theme: Theme, context: ToolRenderContext<TState, Static<TParams>>) => Component;
    renderResult?: (result: AgentToolResult<TDetails>, options: ToolRenderResultOptions, theme: Theme, context: ToolRenderContext<TState, Static<TParams>>) => Component;
}

registerTool<TParams extends TSchema = TSchema, TDetails = unknown, TState = any>(tool: ToolDefinition<TParams, TDetails, TState>): void;
```

`TSchema`/`Static` come from the `typebox` package (same as Rev 1).

## `sendUserMessage` / `sendMessage` options (`deliverAs` values) — unchanged, confirmed

```ts
sendMessage<T = unknown>(
  message: Pick<CustomMessage<T>, "customType" | "content" | "display" | "details">,
  options?: { triggerTurn?: boolean; deliverAs?: "steer" | "followUp" | "nextTurn" },
): void;

sendUserMessage(
  content: string | (TextContent | ImageContent)[],
  options?: { deliverAs?: "steer" | "followUp" },
): void;
```

`ReplacedSessionContext` still has separate `async` (`Promise<void>`) versions of both
with the same option shapes — same caveat as Rev 1: don't conflate with the top-level,
synchronous `pi.sendMessage`/`pi.sendUserMessage`.

## Extension loading from `.pi/extensions/` — unchanged, confirmed

From `dist/core/resource-loader.js`:

```js
join(this.agentDir, "extensions"),           // global
join(this.cwd, CONFIG_DIR_NAME, "extensions"), // project-local
```

and from `dist/config.js`:

```js
export const CONFIG_DIR_NAME = pkg.piConfig?.configDir || ".pi";
```

`CONFIG_DIR_NAME` defaults to `".pi"` — project extensions load from `.pi/extensions/`
relative to `cwd`, confirming the task assumption. Export convention now confirmed via
real examples (see "Extension factory signature" above) — default export.

## `.pi/APPEND_SYSTEM.md` — auto-loaded: YES, unchanged, confirmed

```js
const projectPath = join(this.cwd, CONFIG_DIR_NAME, "APPEND_SYSTEM.md");
...
const globalPath = join(this.agentDir, "APPEND_SYSTEM.md");
```

Both project-local `.pi/APPEND_SYSTEM.md` and global `<agentDir>/APPEND_SYSTEM.md` are
auto-discovered and appended to the system prompt (`ResourceLoader.
getAppendSystemPrompt(): string[]`). Merge order between project vs global was not
traced (private implementation detail, same caveat as Rev 1).

## Sources checked (Rev 2)

- `node_modules/@earendil-works/pi-coding-agent/dist/index.d.ts`
- `node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts`
- `node_modules/@earendil-works/pi-coding-agent/dist/core/resource-loader.js`
- `node_modules/@earendil-works/pi-coding-agent/dist/config.js`
- `node_modules/@earendil-works/pi-coding-agent/examples/extensions/bookmark.ts`
- `node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-agent-core/dist/types.d.ts`
- `node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-ai/dist/types.d.ts`
- `npm view @earendil-works/pi-coding-agent` (package identity/verification on npm)

Anything not quoted above with a file citation was not found in the package and should
not be assumed by later tasks.
