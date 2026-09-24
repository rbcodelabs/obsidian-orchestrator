import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createClaudeThreadsTools } from '../ClaudeThreadsTools';
import { lifecycleResult } from '../ThreadLifecyclePresentation';

// Run against the actual companion checkout without coupling CI to a local path:
// AGENT_THREADS_REPO=/path/to/agent-threads npm test
describe.skipIf(!process.env.AGENT_THREADS_REPO)('real Agent Threads voice bundle', () => {
  it('discovers, reviews, archives, and reports cancellation through the public host bundle', async () => {
    const { createClaudeThreadsApiV1 } = await import(/* @vite-ignore */ resolve(process.env.AGENT_THREADS_REPO!, 'src/PublicApi.ts'));
    const thread = { id: 'integration-thread', title: 'Integration task', status: 'waiting', reviewed: false,
      messages: [], createdAt: 1, updatedAt: 2, agentHarness: 'claude' };
    const archiveThread = vi.fn().mockResolvedValue({ status: 'cancelled', threadId: thread.id });
    const markReviewed = vi.fn(async () => { const changed = !thread.reviewed; thread.reviewed = true; return { threadId: thread.id, reviewed: true, changed }; });
    const service = createClaudeThreadsApiV1({
      getThreads: () => [thread], getThread: (id: string) => id === thread.id ? thread : undefined,
      isRunning: () => false, createThread: vi.fn(), sendMessage: vi.fn(), openThread: vi.fn(),
      archiveThread, markThreadReviewed: markReviewed, subscribe: () => () => {}, listOrchestrators: () => [],
      resolveOrchestrator: async () => null, triggerHostEvent: vi.fn(),
    });
    const tools = createClaudeThreadsTools(() => service.api, { watch() {}, watchAll() {}, unwatch() {} });
    expect(tools.names.has('ct_archive_thread')).toBe(true);
    expect(tools.names.has('ct_mark_reviewed')).toBe(true);
    expect(await tools.execute('ct_list_threads', {})).toContain(thread.id);
    expect(await tools.execute('ct_mark_reviewed', { thread_id: thread.id })).toContain('reviewed');
    expect(thread.reviewed).toBe(true);
    const cancelled = await tools.execute('ct_archive_thread', { thread_id: thread.id });
    expect(lifecycleResult('ct_archive_thread', cancelled)).toBe(`Archive cancelled for thread ${thread.id}.`);
    archiveThread.mockResolvedValueOnce({ status: 'archived', threadId: thread.id });
    expect(lifecycleResult('ct_archive_thread', await tools.execute('ct_archive_thread', { thread_id: thread.id }))).toBe(`Archived thread ${thread.id}.`);
    service.stop();
    expect(await tools.execute('ct_mark_reviewed', { thread_id: thread.id })).toMatch(/^Error:/);
  });
});
