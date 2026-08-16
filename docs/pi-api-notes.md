# pi Extension API notes

Source: `@mariozechner/pi-coding-agent@0.73.1` (installed in `node_modules`). This is the
exact package name given in the task-1 brief; it exists on npm and installed cleanly.

Note: npm printed a deprecation warning on install pointing at
`@earendil-works/pi-coding-agent` as the successor package ("please use
@earendil-works/pi-coding-agent instead going forward"), same for
`@mariozechner/pi-agent-core`, `@mariozechner/pi-tui`, `@mariozechner/pi-ai`. The brief
pins `@mariozechner/pi-coding-agent` explicitly, so that's what's installed and what
these notes describe. Flag this to whoever plans future tasks/upgrades.

Public entry point: `dist/index.d.ts`, re-exporting from `dist/core/extensions/index.d.ts`
(which itself re-exports `dist/core/extensions/types.d.ts`). Everything below is quoted
from `node_modules/@mariozechner/pi-coding-agent/dist/core/extensions/types.d.ts` unless
noted otherwise.

## Extension factory signature

```ts
/** Extension factory function type. Supports both sync and async initialization. */
export type ExtensionFactory = (pi: ExtensionAPI) => void | Promise<void>;
```

An extension module's default export (or however `.pi/extensions/*` loads it — see
below) is a function of this shape, called with an `ExtensionAPI` instance (`pi`).

## `ExtensionAPI` shape (`pi` parameter)

```ts
export interface ExtensionAPI {
    on(event: "resources_discover", handler: ExtensionHandler<ResourcesDiscoverEvent, ResourcesDiscoverResult>): void;
    on(event: "session_start", handler: ExtensionHandler<SessionStartEvent>): void;
    on(event: "session_before_switch", handler: ExtensionHandler<SessionBeforeSwitchEvent, SessionBeforeSwitchResult>): void;
    on(event: "session_before_fork", handler: ExtensionHandler<SessionBeforeForkEvent, SessionBeforeForkResult>): void;
    on(event: "session_before_compact", handler: ExtensionHandler<SessionBeforeCompactEvent, SessionBeforeCompactResult>): void;
    on(event: "session_compact", handler: ExtensionHandler<SessionCompactEvent>): void;
    on(event: "session_shutdown", handler: ExtensionHandler<SessionShutdownEvent>): void;
    on(event: "session_before_tree", handler: ExtensionHandler<SessionBeforeTreeEvent, SessionBeforeTreeResult>): void;
    on(event: "session_tree", handler: ExtensionHandler<SessionTreeEvent>): void;
    on(event: "context", handler: ExtensionHandler<ContextEvent, ContextEventResult>): void;
    on(event: "before_provider_request", handler: ExtensionHandler<BeforeProviderRequestEvent, BeforeProviderRequestEventResult>): void;
    on(event: "after_provider_response", handler: ExtensionHandler<AfterProviderResponseEvent>): void;
    on(event: "before_agent_start", handler: ExtensionHandler<BeforeAgentStartEvent, BeforeAgentStartEventResult>): void;
    on(event: "agent_start", handler: ExtensionHandler<AgentStartEvent>): void;
    on(event: "agent_end", handler: ExtensionHandler<AgentEndEvent>): void;
    on(event: "turn_start", handler: ExtensionHandler<TurnStartEvent>): void;
    on(event: "turn_end", handler: ExtensionHandler<TurnEndEvent>): void;
    on(event: "message_start", handler: ExtensionHandler<MessageStartEvent>): void;
    on(event: "message_update", handler: ExtensionHandler<MessageUpdateEvent>): void;
    on(event: "message_end", handler: ExtensionHandler<MessageEndEvent, MessageEndEventResult>): void;
    on(event: "tool_execution_start", handler: ExtensionHandler<ToolExecutionStartEvent>): void;
    on(event: "tool_execution_update", handler: ExtensionHandler<ToolExecutionUpdateEvent>): void;
    on(event: "tool_execution_end", handler: ExtensionHandler<ToolExecutionEndEvent>): void;
    on(event: "model_select", handler: ExtensionHandler<ModelSelectEvent>): void;
    on(event: "thinking_level_select", handler: ExtensionHandler<ThinkingLevelSelectEvent>): void;
    on(event: "tool_call", handler: ExtensionHandler<ToolCallEvent, ToolCallEventResult>): void;
    on(event: "tool_result", handler: ExtensionHandler<ToolResultEvent, ToolResultEventResult>): void;
    on(event: "user_bash", handler: ExtensionHandler<UserBashEvent, UserBashEventResult>): void;
    on(event: "input", handler: ExtensionHandler<InputEvent, InputEventResult>): void;
    registerTool<TParams extends TSchema = TSchema, TDetails = unknown, TState = any>(tool: ToolDefinition<TParams, TDetails, TState>): void;
    registerCommand(name: string, options: Omit<RegisteredCommand, "name" | "sourceInfo">): void;
    registerShortcut(shortcut: KeyId, options: { description?: string; handler: (ctx: ExtensionContext) => Promise<void> | void }): void;
    registerFlag(name: string, options: { description?: string; type: "boolean" | "string"; default?: boolean | string }): void;
    getFlag(name: string): boolean | string | undefined;
    registerMessageRenderer<T = unknown>(customType: string, renderer: MessageRenderer<T>): void;
    sendMessage<T = unknown>(message: Pick<CustomMessage<T>, "customType" | "content" | "display" | "details">, options?: { triggerTurn?: boolean; deliverAs?: "steer" | "followUp" | "nextTurn" }): void;
    sendUserMessage(content: string | (TextContent | ImageContent)[], options?: { deliverAs?: "steer" | "followUp" }): void;
    appendEntry<T = unknown>(customType: string, data?: T): void;
    setSessionName(name: string): void;
    getSessionName(): string | undefined;
    setLabel(entryId: string, label: string | undefined): void;
    exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult>;
    getActiveTools(): string[];
    getAllTools(): ToolInfo[];
    setActiveTools(toolNames: string[]): void;
    getCommands(): SlashCommandInfo[];
    setModel(model: Model<any>): Promise<boolean>;
    getThinkingLevel(): ThinkingLevel;
    setThinkingLevel(level: ThinkingLevel): void;
    registerProvider(name: string, config: ProviderConfig): void;
    unregisterProvider(name: string): void;
    /** Shared event bus for extension communication. */
    events: EventBus;
}
```

`ExtensionHandler` type:

```ts
export type ExtensionHandler<E, R = undefined> = (event: E, ctx: ExtensionContext) => Promise<R | void> | R | void;
```

So every event handler receives `(event, ctx)` where `ctx: ExtensionContext`.

## `turn_end` event payload

```ts
/** Fired at the end of each turn */
export interface TurnEndEvent {
    type: "turn_end";
    turnIndex: number;
    message: AgentMessage;
    toolResults: ToolResultMessage[];
}
```

There is **no direct token/context-usage field on `TurnEndEvent` itself**. Token usage
lives on `message` when it is an assistant message. `AgentMessage` (from
`@mariozechner/pi-agent-core`, `dist/types.d.ts`) is:

```ts
export type AgentMessage = Message | CustomAgentMessages[keyof CustomAgentMessages];
```

and `Message` (from `@mariozechner/pi-ai`, `dist/types.d.ts`) is:

```ts
export type Message = UserMessage | AssistantMessage | ToolResultMessage;

export interface AssistantMessage {
    role: "assistant";
    content: (TextContent | ThinkingContent | ToolCall)[];
    api: Api;
    provider: Provider;
    model: string;
    responseModel?: string;
    responseId?: string;
    diagnostics?: AssistantMessageDiagnostic[];
    usage: Usage;
    stopReason: StopReason;
    errorMessage?: string;
    timestamp: number;
}

export interface Usage {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
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

So to read token usage on `turn_end`, narrow `event.message.role === "assistant"` and
read `event.message.usage.{input,output,cacheRead,cacheWrite,totalTokens}` and
`event.message.usage.cost.{input,output,cacheRead,cacheWrite,total}`.

Separately, for **live/aggregate context usage** (not per-turn), `ExtensionContext`
exposes:

```ts
export interface ContextUsage {
    /** Estimated context tokens, or null if unknown (e.g. right after compaction, before next LLM response). */
    tokens: number | null;
    contextWindow: number;
    /** Context usage as percentage of context window, or null if tokens is unknown. */
    percent: number | null;
}
// on ExtensionContext:
getContextUsage(): ContextUsage | undefined;
```

## `agent_settled` — NOT FOUND

I searched the full `dist/` tree (`.d.ts`, `.js`, `.js.map`) of
`@mariozechner/pi-coding-agent` for `agent_settled`, `agentSettled`, and `settled`.
There is no such event. The only "settled" hits are unrelated local variables named
`settled` in `main.js` promise-handling code (`let settled = false; ...`), not an event.

The full set of event-type string literals in `ExtensionEvent` (from `types.d.ts`) is:

`resources_discover`, `session_start`, `session_before_switch`, `session_before_fork`,
`session_before_compact`, `session_compact`, `session_shutdown`, `session_before_tree`,
`session_tree`, `context`, `before_provider_request`, `after_provider_response`,
`before_agent_start`, `agent_start`, `agent_end`, `turn_start`, `turn_end`,
`message_start`, `message_update`, `message_end`, `tool_execution_start`,
`tool_execution_update`, `tool_execution_end`, `model_select`, `thinking_level_select`,
`user_bash`, `input`, `tool_call`, `tool_result`.

The closest analogues to "agent settled" are `agent_end` (`{ type: "agent_end"; messages:
AgentMessage[] }`, fired when an agent loop ends) and `ctx.isIdle()` /
`ctx.hasPendingMessages()` on `ExtensionContext` for polling idle state. Future tasks
that assumed `agent_settled` exists must be corrected to use one of these instead — do
not guess a payload shape for a nonexistent event.

## `ctx.compact` signature

On `ExtensionContext`:

```ts
export interface CompactOptions {
    customInstructions?: string;
    onComplete?: (result: CompactionResult) => void;
    onError?: (error: Error) => void;
}

// ExtensionContext:
compact(options?: CompactOptions): void;
```

It is fire-and-forget (`void` return, not a Promise) — completion/error are observed via
the `onComplete`/`onError` callbacks in `CompactOptions`, or by listening to the
`session_compact` event (`{ type: "session_compact"; compactionEntry: CompactionEntry;
fromExtension: boolean }`).

## `registerTool` shape (incl. TypeBox `parameters`)

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

// on ExtensionAPI:
registerTool<TParams extends TSchema = TSchema, TDetails = unknown, TState = any>(tool: ToolDefinition<TParams, TDetails, TState>): void;
```

`TSchema`/`Static` are imported from the `typebox` package (`import type { Static,
TSchema } from "typebox";` in `types.d.ts`) — i.e. tools declare `parameters` as a
TypeBox schema object (e.g. `Type.Object({...})`), and `Static<TParams>` gives the
inferred TS type for `params`/`args` in `execute`/render callbacks.

There's also a standalone helper for defining a tool with preserved generic inference:

```ts
export declare function defineTool<TParams extends TSchema, TDetails = unknown, TState = any>(
  tool: ToolDefinition<TParams, TDetails, TState>
): ToolDefinition<TParams, TDetails, TState> & AnyToolDefinition;
```

## `sendUserMessage` / `sendMessage` options (`deliverAs` values)

On `ExtensionAPI` (fire-and-forget, `void` return):

```ts
sendMessage<T = unknown>(
  message: Pick<CustomMessage<T>, "customType" | "content" | "display" | "details">,
  options?: { triggerTurn?: boolean; deliverAs?: "steer" | "followUp" | "nextTurn" },
): void;

/**
 * Send a user message to the agent. Always triggers a turn.
 * When the agent is streaming, use deliverAs to specify how to queue the message.
 */
sendUserMessage(
  content: string | (TextContent | ImageContent)[],
  options?: { deliverAs?: "steer" | "followUp" },
): void;
```

So:
- `sendMessage` (custom message) `deliverAs` ∈ `"steer" | "followUp" | "nextTurn"`.
- `sendUserMessage` `deliverAs` ∈ `"steer" | "followUp"` (no `"nextTurn"` — it always
  triggers a turn immediately per the doc comment).

Note: `ReplacedSessionContext` (passed into `newSession`/`fork`/`switchSession`
`withSession` callbacks) has its own async versions of both with the same option
shapes but returning `Promise<void>`:

```ts
sendMessage<T = unknown>(message: Pick<CustomMessage<T>, "customType" | "content" | "display" | "details">, options?: { triggerTurn?: boolean; deliverAs?: "steer" | "followUp" | "nextTurn" }): Promise<void>;
sendUserMessage(content: string | (TextContent | ImageContent)[], options?: { deliverAs?: "steer" | "followUp" }): Promise<void>;
```

Don't conflate the two — `pi.sendMessage`/`pi.sendUserMessage` (top-level `ExtensionAPI`)
are synchronous/`void`; the `ReplacedSessionContext` variants are `async`.

## Extension loading from `.pi/extensions/`

From `dist/core/resource-loader.js` (`DefaultResourceLoader`), the default extension
search paths include (in `normalizeExtensionPaths`, around line 470-476):

```js
join(this.agentDir, "extensions"),      // global, e.g. ~/.pi/agent/extensions (see below)
...
join(this.cwd, CONFIG_DIR_NAME, "extensions"),   // project-local
```

and from `dist/config.js`:

```js
export const CONFIG_DIR_NAME = pkg.piConfig?.configDir || ".pi";
```

So by default `CONFIG_DIR_NAME` is `".pi"`, meaning project extensions are loaded from
`.pi/extensions/` relative to `cwd` — confirming the task assumption. (`CONFIG_DIR_NAME`
is overridable via a `piConfig.configDir` field in the loading tool's own package.json,
but defaults to `.pi`.) Loader also discovers `.pi/skills`, `.pi/prompts`, `.pi/themes`
alongside `.pi/extensions` the same way.

Extensions are ultimately loaded via `loadExtensions(extensionPaths, this.cwd,
this.eventBus)` (imported in resource-loader.js), producing a `LoadExtensionsResult`
(`{ extensions: Extension[]; errors: Array<{path,error}>; runtime: ExtensionRuntime }`).
Each `Extension` module is expected to export something loadable as an `ExtensionFactory`
(`(pi: ExtensionAPI) => void | Promise<void>`) — I did not find the exact "default export
vs named export" convention documented in the `.d.ts` files; this would need confirming
against `loadExtensions`' implementation (in `pi-coding-agent`'s core, function not
re-exported as a public `.d.ts` I found) or the package's own examples/README before a
later task relies on a specific export shape.

## `.pi/APPEND_SYSTEM.md` — auto-loaded: YES

From `dist/core/resource-loader.js`, `discoverAppendSystemPromptFile` (around line
673-677):

```js
const projectPath = join(this.cwd, CONFIG_DIR_NAME, "APPEND_SYSTEM.md");
...
const globalPath = join(this.agentDir, "APPEND_SYSTEM.md");
```

Confirmed: both a project-local `.pi/APPEND_SYSTEM.md` and a global
`<agentDir>/APPEND_SYSTEM.md` are auto-discovered and their contents appended to the
system prompt (exposed publicly via `ResourceLoader.getAppendSystemPrompt(): string[]`
and `DefaultResourceLoaderOptions.appendSystemPrompt?: string[]` /
`appendSystemPromptOverride?`). I did not verify the exact merge order (project vs
global) — that's in the private implementation of `discoverAppendSystemPromptFile`.

## Sources checked

- `node_modules/@mariozechner/pi-coding-agent/dist/index.d.ts`
- `node_modules/@mariozechner/pi-coding-agent/dist/core/extensions/index.d.ts`
- `node_modules/@mariozechner/pi-coding-agent/dist/core/extensions/types.d.ts`
- `node_modules/@mariozechner/pi-coding-agent/dist/core/resource-loader.d.ts`
- `node_modules/@mariozechner/pi-coding-agent/dist/core/resource-loader.js`
- `node_modules/@mariozechner/pi-coding-agent/dist/config.js`
- `node_modules/@mariozechner/pi-coding-agent/dist/main.js` (grep for `settled`)
- `node_modules/@mariozechner/pi-agent-core/dist/types.d.ts`
- `node_modules/@mariozechner/pi-ai/dist/types.d.ts`

Anything not quoted above with a file citation was not found in the package and should
not be assumed by later tasks.
