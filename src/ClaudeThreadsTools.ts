import type { AgentToolDefinition, ClaudeThreadsApiV1 } from './ClaudeThreadsApiTypes';

export interface WatchPolicy { watch(threadId: string): void; watchAll(): void | Promise<void>; unwatch(threadId?: string): void }
const stringProperty = (description: string) => ({ type: 'string', description });
const booleanProperty = (description: string) => ({ type: 'boolean', description });
const numberProperty = (description: string) => ({ type: 'number', description });
const localTools: readonly AgentToolDefinition[] = [
  { type: 'function', name: 'ct_watch', description: 'Watch one Claude thread, or all current threads when no ID is supplied.', parameters: { type: 'object', properties: { thread_id: stringProperty('Thread ID to watch.') }, required: [] } },
  { type: 'function', name: 'ct_unwatch', description: 'Stop watching one Claude thread, or all watched threads when no ID is supplied.', parameters: { type: 'object', properties: { thread_id: stringProperty('Thread ID to stop watching.') }, required: [] } },
  { type: 'function', name: 'ct_list_orchestrators', description: 'List available portfolio and project orchestrator targets.', parameters: { type: 'object', properties: {}, required: [] } },
  { type: 'function', name: 'ct_dispatch_orchestrator', description: 'Delegate a message to a portfolio or project orchestrator. Waits for its result by default.', parameters: { type: 'object', properties: {
    target_id: stringProperty('Orchestrator target ID.'),
    message: stringProperty('Message to dispatch.'),
    wait: booleanProperty('Wait for completion and return the result (default true).'),
    watch: booleanProperty('When wait=false, watch the target thread for voice notifications (default true).'),
    timeout_secs: numberProperty('Seconds to wait before timing out (default 120, min 10, max 300).'),
  }, required: ['target_id', 'message'] } },
];
export interface ClaudeThreadsTools { readonly definitions: readonly AgentToolDefinition[]; readonly names: ReadonlySet<string>; execute(name: string, args: Record<string, unknown>): Promise<string> }

export function createClaudeThreadsTools(getApi: () => ClaudeThreadsApiV1, bridge: WatchPolicy): ClaudeThreadsTools {
  const api = getApi();
  const bundle = api.agentTools.createBundle('voice-orchestration');
  const definitions = [...bundle.tools.map(addWatchOption), ...localTools];
  const bundleNames = new Set(bundle.tools.map(tool => tool.name));
  const names = new Set(definitions.map(tool => tool.name));
  return {
    definitions, names,
    execute: async (name, args) => {
      try {
        if (bundleNames.has(name)) {
          const result = await bundle.execute(name, args);
          if (args.wait === false && args.watch !== false && name === 'ct_send_message') {
            const threadId = String(args.thread_id ?? '').trim(); if (threadId) bridge.watch(threadId);
          }
          if (args.wait === false && args.watch !== false && name === 'ct_new_thread') {
            const threadId = /New thread started \(id: ([^)]+)\)/.exec(result)?.[1];
            if (threadId) bridge.watch(threadId);
          }
          return result;
        }
        if (name === 'ct_watch') {
          const id = String(args.thread_id ?? '').trim(); if (id) bridge.watch(id); else await bridge.watchAll();
          return id ? `Watching thread ${id}.` : 'Watching all current threads.';
        }
        if (name === 'ct_unwatch') {
          const id = String(args.thread_id ?? '').trim(); bridge.unwatch(id || undefined);
          return id ? `Stopped watching thread ${id}.` : 'Stopped watching all threads.';
        }
        if (name === 'ct_list_orchestrators') return JSON.stringify({ orchestrators: await api.orchestrators.list() }, null, 2);
        if (name === 'ct_dispatch_orchestrator') {
          const targetId = String(args.target_id ?? '').trim(); const prompt = String(args.message ?? '').trim();
          if (!targetId || !prompt) return 'Error: target_id and message are required.';
          const target = (await api.orchestrators.list()).find(candidate => candidate.id === targetId);
          if (!target) return `Error: orchestrator target "${targetId}" was not found.`;
          const result = await api.orchestrators.dispatch({ id: targetId }, { prompt });
          if (args.wait === false) {
            if (args.watch !== false) bridge.watch(target.threadId);
            return `Dispatched to orchestrator ${targetId} (run: ${result.runId}). Running in the background.`;
          }
          return formatOrchestratorResult(await api.threads.wait(result.runId, { timeoutMs: boundedTimeoutMs(args.timeout_secs) }));
        }
        return `Error: Claude Threads tool "${name}" is unavailable.`;
      } catch (error) { return `Error: ${error instanceof Error ? error.message : String(error)}`; }
    },
  };
}

function boundedTimeoutMs(value: unknown): number {
  return Math.min(Math.max(10, Number(value) || 120), 300) * 1_000;
}

function formatOrchestratorResult(result: Awaited<ReturnType<ClaudeThreadsApiV1['threads']['wait']>>): string {
  if (result.status === 'timed_out') return `Timed out waiting for orchestrator run ${result.runId}.`;
  if (result.status === 'failed') return `Orchestrator error: ${result.error.message}`;
  if (!result.finalMessage) return `Orchestrator finished (run: ${result.runId}) with no final message.`;
  return `Orchestrator finished. Last message: ${result.finalMessage.content.slice(0, 800)}`;
}

function addWatchOption(tool: AgentToolDefinition): AgentToolDefinition {
  if (tool.name !== 'ct_send_message' && tool.name !== 'ct_new_thread') return tool;
  const properties = (tool.parameters.properties as Record<string, unknown> | undefined) ?? {};
  return {
    ...tool,
    parameters: {
      ...tool.parameters,
      properties: {
        ...properties,
        watch: { type: 'boolean', description: 'When wait=false, watch the background thread for voice notifications (default true).' },
      },
    },
  };
}
