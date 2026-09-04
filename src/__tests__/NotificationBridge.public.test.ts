import { describe, expect, it, vi } from 'vitest';
import { NotificationBridge } from '../NotificationBridge';
import type { ClaudeThreadsApiV1, PublicThreadEvent } from '../ClaudeThreadsApiTypes';

it('subscribes to semantic events, resyncs public snapshots, and disposes idempotently', async () => {
  let listener!: (event: PublicThreadEvent) => void;
  const dispose = vi.fn();
  const api = {
    generation: 'g1', apiVersion: 1, capabilities: [],
    threads: {
      subscribe: vi.fn((fn) => { listener = fn; return { dispose }; }),
      get: vi.fn().mockResolvedValue({ id: 't1', title: 'Task', isRunning: false, messages: [{ id: 'm1', role: 'assistant', content: 'Done', timestamp: 1 }] }),
      list: vi.fn().mockResolvedValue([{ id: 't1' }, { id: 't2' }]),
    },
  } as unknown as ClaudeThreadsApiV1;
  const session = { injectNotification: vi.fn() };
  const bridge = new NotificationBridge(); bridge.connect(api, session);
  bridge.watch('t1');
  listener({ kind: 'run.completed', threadId: 't1', runId: 'r1', at: 1 });
  await vi.waitFor(() => expect(session.injectNotification).toHaveBeenCalledWith('t1', expect.stringContaining('Done')));
  await bridge.watchAll();
  expect(bridge.isWatching('t2')).toBe(true);
  bridge.disconnect(); bridge.disconnect();
  expect(dispose).toHaveBeenCalledTimes(1);
});
