import { describe, expect, it, vi } from 'vitest';
import { createClaudeThreadsTools } from '../ClaudeThreadsTools';
import type { ClaudeThreadsApiV1 } from '../ClaudeThreadsApiTypes';

function setup() {
  const execute = vi.fn().mockResolvedValue('bundle-result');
  const api = {
    apiVersion: 1, generation: 'g1', capabilities: [],
    agentTools: { createBundle: vi.fn(() => ({ tools: [
      { type: 'function', name: 'ct_list_threads', description: 'list', parameters: {} },
      { type: 'function', name: 'ct_send_message', description: 'send', parameters: { type: 'object', properties: {} } },
      { type: 'function', name: 'ct_new_thread', description: 'new', parameters: { type: 'object', properties: {} } },
    ], execute })) },
    orchestrators: {
      list: vi.fn().mockResolvedValue([{ id: 'portfolio', kind: 'portfolio', threadId: 't1', title: 'Portfolio' }]),
      dispatch: vi.fn().mockResolvedValue({ runId: 'run-1' }),
    },
    threads: { list: vi.fn(), get: vi.fn(), create: vi.fn(), send: vi.fn(), wait: vi.fn().mockResolvedValue({ status: 'completed', runId: 'run-1', threadId: 't1', finalMessage: { id: 'm1', role: 'assistant', content: 'Review complete', timestamp: 1 } }), open: vi.fn(), subscribe: vi.fn() },
  } as unknown as ClaudeThreadsApiV1;
  const bridge = { watch: vi.fn(), watchAll: vi.fn(), unwatch: vi.fn() };
  return { api, execute, bridge, tools: createClaudeThreadsTools(() => api, bridge) };
}

describe('public Claude Threads tool adapter', () => {
  it('uses the transport-neutral voice-orchestration bundle for schemas and execution', async () => {
    const { api, execute, tools } = setup();
    expect(api.agentTools.createBundle).toHaveBeenCalledWith('voice-orchestration');
    expect(tools.definitions.map(tool => tool.name)).toContain('ct_list_threads');
    await tools.execute('ct_list_threads', { status: 'all' });
    expect(execute).toHaveBeenCalledWith('ct_list_threads', { status: 'all' });
  });

  it('keeps watch/unwatch as local notification policy', async () => {
    const { bridge, tools } = setup();
    await tools.execute('ct_watch', { thread_id: 't1' });
    await tools.execute('ct_unwatch', { thread_id: 't1' });
    expect(bridge.watch).toHaveBeenCalledWith('t1');
    expect(bridge.unwatch).toHaveBeenCalledWith('t1');
  });

  it('preserves background auto-watch for send and new-thread tools', async () => {
    const { execute, bridge, tools } = setup();
    execute.mockResolvedValueOnce('Message sent to thread t1. Running in the background.');
    await tools.execute('ct_send_message', { thread_id: 't1', message: 'go', wait: false });
    execute.mockResolvedValueOnce('New thread started (id: t2). Running in the background.');
    await tools.execute('ct_new_thread', { message: 'go', wait: false });
    expect(bridge.watch).toHaveBeenCalledWith('t1');
    expect(bridge.watch).toHaveBeenCalledWith('t2');
    const send = tools.definitions.find(tool => tool.name === 'ct_send_message');
    expect((send?.parameters.properties as Record<string, unknown>)).toHaveProperty('watch');
  });

  it('lists and dispatches high-level orchestrator targets, waiting by default', async () => {
    const { api, tools } = setup();
    expect(await tools.execute('ct_list_orchestrators', {})).toContain('portfolio');
    expect(await tools.execute('ct_dispatch_orchestrator', { target_id: 'portfolio', message: 'Review this' })).toContain('Review complete');
    expect(api.orchestrators.dispatch).toHaveBeenCalledWith({ id: 'portfolio' }, { prompt: 'Review this' });
    expect(api.threads.wait).toHaveBeenCalledWith('run-1', { timeoutMs: 120_000 });
  });

  it('exposes wait, watch, and bounded timeout controls for orchestrator dispatch', async () => {
    const { tools } = setup();
    const definition = tools.definitions.find(tool => tool.name === 'ct_dispatch_orchestrator');
    const properties = definition?.parameters.properties as Record<string, unknown>;
    expect(properties).toHaveProperty('wait');
    expect(properties).toHaveProperty('watch');
    expect(properties).toHaveProperty('timeout_secs');
  });

  it('bounds orchestrator wait time consistently to 10–300 seconds', async () => {
    const low = setup();
    await low.tools.execute('ct_dispatch_orchestrator', { target_id: 'portfolio', message: 'Review', timeout_secs: 1 });
    expect(low.api.threads.wait).toHaveBeenCalledWith('run-1', { timeoutMs: 10_000 });
    const high = setup();
    await high.tools.execute('ct_dispatch_orchestrator', { target_id: 'portfolio', message: 'Review', timeout_secs: 999 });
    expect(high.api.threads.wait).toHaveBeenCalledWith('run-1', { timeoutMs: 300_000 });
  });

  it('watches the resolved target thread for background orchestrator dispatch unless disabled', async () => {
    const { api, bridge, tools } = setup();
    const result = await tools.execute('ct_dispatch_orchestrator', { target_id: 'portfolio', message: 'Review this', wait: false });
    expect(result).toContain('run-1');
    expect(bridge.watch).toHaveBeenCalledWith('t1');
    expect(api.threads.wait).not.toHaveBeenCalled();
    bridge.watch.mockClear();
    await tools.execute('ct_dispatch_orchestrator', { target_id: 'portfolio', message: 'Again', wait: false, watch: false });
    expect(bridge.watch).not.toHaveBeenCalled();
  });

  it.each([
    [{ status: 'failed', runId: 'run-1', threadId: 't1', error: { code: 'RUN_FAILED', message: 'Agent failed' } }, 'Agent failed'],
    [{ status: 'timed_out', runId: 'run-1', threadId: 't1' }, 'Timed out'],
  ])('returns a concise terminal result when orchestrator waiting ends with %s', async (waitResult, expected) => {
    const { api, tools } = setup();
    vi.mocked(api.threads.wait).mockResolvedValue(waitResult as never);
    expect(await tools.execute('ct_dispatch_orchestrator', { target_id: 'portfolio', message: 'Review' })).toContain(expected);
  });

  it('returns clean validation errors for unknown targets and missing messages', async () => {
    const { tools } = setup();
    expect(await tools.execute('ct_dispatch_orchestrator', { target_id: 'missing', message: 'Review' })).toBe('Error: orchestrator target "missing" was not found.');
    expect(await tools.execute('ct_dispatch_orchestrator', { target_id: 'portfolio' })).toBe('Error: target_id and message are required.');
  });

  it('does not expose destructive or active-view compatibility tools', () => {
    const { tools } = setup();
    const names = tools.definitions.map(tool => tool.name);
    expect(names).not.toContain('ct_close_thread');
    expect(names).not.toContain('ct_get_active_thread');
  });
});
