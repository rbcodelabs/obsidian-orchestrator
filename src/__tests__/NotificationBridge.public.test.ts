import { describe, expect, it, vi } from 'vitest';
import { NotificationBridge } from '../NotificationBridge';
import type { ClaudeThreadsApiV1, PublicThreadEvent } from '../ClaudeThreadsApiTypes';

it.each(['reconnect', 'unwatch'])('drops an in-flight notification after %s', async (action) => {
  let listener!: (event: PublicThreadEvent) => void;
  let resolveSnapshot!: (snapshot: unknown) => void;
  const snapshot = new Promise(resolve => { resolveSnapshot = resolve; });
  const api = { threads: {
    subscribe: (fn: typeof listener) => { listener = fn; return { dispose() {} }; },
    get: () => snapshot,
  } } as unknown as ClaudeThreadsApiV1;
  const first = { injectNotification: vi.fn() };
  const next = { injectNotification: vi.fn() };
  const bridge = new NotificationBridge();
  bridge.connect(api, first);
  bridge.watch('t1');
  listener({ kind: 'run.completed', threadId: 't1', runId: 'r1', at: 1 });
  if (action === 'reconnect') bridge.connect(api, next);
  else bridge.unwatch('t1');
  resolveSnapshot({ id: 't1', title: 'Old result', messages: [] });
  await snapshot;
  await Promise.resolve();
  expect(first.injectNotification).not.toHaveBeenCalled();
  expect(next.injectNotification).not.toHaveBeenCalled();
});

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
