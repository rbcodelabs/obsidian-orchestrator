import { describe, expect, it, vi } from 'vitest';
import { ClaudeThreadsApiClient, ThreadsApiUnavailableError } from '../ClaudeThreadsApiClient';
import type { ClaudeThreadsApiV1 } from '../ClaudeThreadsApiTypes';

function api(generation = 'gen-1'): ClaudeThreadsApiV1 {
  return {
    apiVersion: 1,
    generation,
    capabilities: [],
    threads: {
      list: vi.fn().mockResolvedValue([]), get: vi.fn().mockResolvedValue(null),
      create: vi.fn(), send: vi.fn(), wait: vi.fn(), open: vi.fn(),
      subscribe: vi.fn().mockReturnValue({ dispose: vi.fn() }),
    },
    orchestrators: { list: vi.fn().mockResolvedValue([]), dispatch: vi.fn() },
    agentTools: { createBundle: vi.fn() },
  };
}

function host(plugin: unknown) {
  const handlers = new Map<string, Set<(payload: unknown) => void>>();
  const workspace = {
    on: vi.fn((name: string, fn: (payload: unknown) => void) => {
      const set = handlers.get(name) ?? new Set(); set.add(fn); handlers.set(name, set);
      return { name, fn };
    }),
    offref: vi.fn((ref: { name: string; fn: (payload: unknown) => void }) => handlers.get(ref.name)?.delete(ref.fn)),
  };
  return {
    app: { plugins: { getPlugin: vi.fn(() => plugin) }, workspace },
    emit(name: string, payload: unknown) { for (const fn of handlers.get(name) ?? []) fn(payload); },
    workspace,
  };
}

describe('ClaudeThreadsApiClient', () => {
  it('discovers only the published api.v1 surface', () => {
    const published = api();
    const h = host({ api: { v1: published } });
    const client = new ClaudeThreadsApiClient(h.app);
    client.start();
    expect(client.current()).toBe(published);
    expect(h.app.plugins.getPlugin).toHaveBeenCalledWith('claude-threads');
  });

  it('supports the Obsidian-compatible plugin map when getPlugin is unavailable', () => {
    const published = api();
    const h = host(null);
    const app = { plugins: { plugins: { 'claude-threads': { api: { v1: published } } } }, workspace: h.workspace };
    const client = new ClaudeThreadsApiClient(app); client.start();
    expect(client.current()).toBe(published);
  });

  it('rejects missing and version-incompatible APIs with a useful public error', () => {
    const missing = new ClaudeThreadsApiClient(host(null).app); missing.start();
    expect(() => missing.requireApi()).toThrowError(ThreadsApiUnavailableError);
    const incompatible = new ClaudeThreadsApiClient(host({ api: { v1: { apiVersion: 2 } } }).app); incompatible.start();
    expect(() => incompatible.requireApi()).toThrow(/API v1/);
  });

  it('rebinds by generation on ready and unbinds only the matching generation on stopping', () => {
    let plugin: unknown = { api: { v1: api('one') } };
    const h = host(null);
    h.app.plugins.getPlugin.mockImplementation(() => plugin);
    const client = new ClaudeThreadsApiClient(h.app); client.start();
    const changes = vi.fn(); client.onChange(changes);
    plugin = { api: { v1: api('two') } };
    h.emit('claude-threads:api-ready', { apiVersion: 1, generation: 'two' });
    expect(client.requireApi().generation).toBe('two');
    h.emit('claude-threads:api-stopping', { apiVersion: 1, generation: 'one' });
    expect(client.requireApi().generation).toBe('two');
    h.emit('claude-threads:api-stopping', { apiVersion: 1, generation: 'two' });
    expect(() => client.requireApi()).toThrow(ThreadsApiUnavailableError);
    expect(changes).toHaveBeenCalledTimes(2);
  });

  it('disposes lifecycle registrations idempotently', () => {
    const h = host({ api: { v1: api() } });
    const client = new ClaudeThreadsApiClient(h.app); client.start(); client.dispose(); client.dispose();
    expect(h.workspace.offref).toHaveBeenCalledTimes(2);
  });
});
