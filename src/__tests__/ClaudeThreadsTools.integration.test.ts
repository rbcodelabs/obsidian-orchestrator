import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createClaudeThreadsTools } from '../ClaudeThreadsTools';
import { lifecycleResult } from '../ThreadLifecyclePresentation';

// Run against the actual companion checkout without coupling CI to a local path:
// AGENT_THREADS_REPO=/path/to/agent-threads npm test
describe.skipIf(!process.env.AGENT_THREADS_REPO)('real Agent Threads voice bundle', () => {
  it('discovers, reviews, archives, and reports cancellation through the public host bundle', async () => {
    const { createClaudeThreadsApiV1 } = await import(/* @vite-ignore */ resolve(process.env.AGENT_THREADS_REPO!, 'src/PublicApi.ts'));
    const { createPublicThreadLifecycle } = await import(/* @vite-ignore */ resolve(process.env.AGENT_THREADS_REPO!, 'src/publicThreadLifecycle.ts'));
    const thread = { id: 'integration-thread', title: 'Integration task', status: 'waiting', reviewed: false,
      messages: [], createdAt: 1, updatedAt: 2, agentHarness: 'claude' };
    const threads = [thread, { ...thread, id: 'retained-thread' }];
    let savedThreads = structuredClone(threads);
    let saveBarrier = Promise.resolve();
    let running = false;
    const confirm = vi.fn(async () => false);
    const cancelWakeups = vi.fn(async () => {});
    const saveSettings = vi.fn(async () => { await saveBarrier; savedThreads = structuredClone(threads); });
    const openThread = vi.fn();
    const notifyReviewed = vi.fn();
    const lifecycle = createPublicThreadLifecycle({
      getThreads: () => threads, isRunning: () => running,
      getOrchestratorContext: () => ({ projects: [] }), confirm, cancelWakeups, saveSettings, notifyReviewed,
      archiveThread: async (id: string, assertSafe: () => void) => {
        assertSafe();
        threads.splice(threads.findIndex(item => item.id === id), 1);
      },
    });
    const service = createClaudeThreadsApiV1({
      getThreads: () => threads, getThread: (id: string) => threads.find(item => item.id === id),
      isRunning: () => running, createThread: vi.fn(), sendMessage: vi.fn(), openThread,
      archiveThread: lifecycle.archive, markThreadReviewed: lifecycle.markReviewed, subscribe: () => () => {}, listOrchestrators: () => [],
      resolveOrchestrator: async () => null, triggerHostEvent: vi.fn(),
    });
    const tools = createClaudeThreadsTools(() => service.api, { watch() {}, watchAll() {}, unwatch() {} });
    expect(tools.names.has('ct_archive_thread')).toBe(true);
    expect(tools.names.has('ct_mark_reviewed')).toBe(true);
    expect(await tools.execute('ct_list_threads', {})).toContain(thread.id);
    expect(await tools.execute('ct_mark_reviewed', { thread_id: thread.id })).toContain('reviewed');
    expect(savedThreads.find(item => item.id === thread.id)?.reviewed).toBe(true);
    expect(thread.updatedAt).toBe(2);
    expect(notifyReviewed).toHaveBeenCalledExactlyOnceWith(thread.id);
    expect(openThread).not.toHaveBeenCalled();
    expect(await tools.execute('ct_mark_reviewed', { thread_id: thread.id })).toContain('already reviewed');
    expect(saveSettings).toHaveBeenCalledOnce();
    running = true;
    const cancelled = await tools.execute('ct_archive_thread', { thread_id: thread.id });
    expect(lifecycleResult('ct_archive_thread', cancelled)).toBe(`Archive cancelled for thread ${thread.id}.`);
    expect(confirm).toHaveBeenCalledOnce();
    expect(cancelWakeups).not.toHaveBeenCalled();
    expect(savedThreads).toHaveLength(2);
    expect(threads).toHaveLength(2);
    expect(saveSettings).toHaveBeenCalledOnce();
    running = false;
    let releaseSave!: () => void;
    saveBarrier = new Promise<void>(resolve => { releaseSave = resolve; });
    let resolved = false;
    const archive = tools.execute('ct_archive_thread', { thread_id: thread.id }).then(result => { resolved = true; return result; });
    await vi.waitFor(() => expect(saveSettings).toHaveBeenCalledTimes(2));
    expect(resolved).toBe(false);
    expect(cancelWakeups).toHaveBeenCalledExactlyOnceWith(thread.id);
    expect(savedThreads).toHaveLength(2);
    releaseSave();
    expect(lifecycleResult('ct_archive_thread', await archive)).toBe(`Archived thread ${thread.id}.`);
    expect(savedThreads.map(item => item.id)).toEqual(['retained-thread']);
    expect(threads.map(item => item.id)).toEqual(['retained-thread']);
    service.stop();
    expect(await tools.execute('ct_mark_reviewed', { thread_id: thread.id })).toMatch(/^Error:/);
  });
});
