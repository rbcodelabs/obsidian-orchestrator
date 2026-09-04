import { describe, expect, it, vi } from 'vitest';
import { createClaudeThreadsTools } from '../ClaudeThreadsTools';
import type { ClaudeThreadsApiV1 } from '../ClaudeThreadsApiTypes';

function setup() {
  const execute = vi.fn().mockResolvedValue('bundle-result');
  const api = {
    apiVersion: 1, generation: 'g1', capabilities: [],
    agentTools: { createBundle: vi.fn(() => ({ tools: [{ type: 'function', name: 'ct_list_threads', description: 'list', parameters: {} }], execute })) },
    orchestrators: {
      list: vi.fn().mockResolvedValue([{ id: 'portfolio', kind: 'portfolio', threadId: 't1', title: 'Portfolio' }]),
      dispatch: vi.fn().mockResolvedValue({ runId: 'run-1' }),
    },
    threads: { list: vi.fn(), get: vi.fn(), create: vi.fn(), send: vi.fn(), wait: vi.fn(), open: vi.fn(), subscribe: vi.fn() },
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

  it('lists and dispatches high-level orchestrator targets', async () => {
    const { api, tools } = setup();
    expect(await tools.execute('ct_list_orchestrators', {})).toContain('portfolio');
    expect(await tools.execute('ct_dispatch_orchestrator', { target_id: 'portfolio', message: 'Review this' })).toContain('run-1');
    expect(api.orchestrators.dispatch).toHaveBeenCalledWith({ id: 'portfolio' }, { prompt: 'Review this' });
  });

  it('does not expose destructive or active-view compatibility tools', () => {
    const { tools } = setup();
    const names = tools.definitions.map(tool => tool.name);
    expect(names).not.toContain('ct_close_thread');
    expect(names).not.toContain('ct_get_active_thread');
  });
});
