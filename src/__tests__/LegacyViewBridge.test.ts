import { describe, expect, it, vi } from 'vitest';
import { scheduleLegacyViewBridge } from '../LegacyViewBridge';

describe('legacy view bridge registration', () => {
  it.each([
    { plugins: { getPlugin: (id: string) => id === 'obsidian-orchestrator' ? {} : null } },
    { plugins: { plugins: { 'obsidian-orchestrator': {} } } },
  ])('does not claim the global legacy view type when the old plugin is active', (app) => {
    const registerView = vi.fn();
    let onReady: (() => void) | undefined;
    scheduleLegacyViewBridge(
      { ...app, workspace: { onLayoutReady: (callback: () => void) => { onReady = callback; } } } as never,
      registerView,
      vi.fn(),
    );

    onReady?.();

    expect(registerView).not.toHaveBeenCalled();
  });

  it('rechecks plugin state at layout-ready time to cover later plugin loading', () => {
    const registry: Record<string, unknown> = {};
    const registerView = vi.fn();
    let onReady: (() => void) | undefined;
    scheduleLegacyViewBridge(
      {
        plugins: { plugins: registry },
        workspace: { onLayoutReady: (callback: () => void) => { onReady = callback; } },
      } as never,
      registerView,
      vi.fn(),
    );
    registry['obsidian-orchestrator'] = {};

    onReady?.();

    expect(registerView).not.toHaveBeenCalled();
  });

  it('registers and migrates only when the previous plugin is absent', async () => {
    const registerView = vi.fn();
    const migrate = vi.fn().mockResolvedValue(undefined);
    let onReady: (() => void) | undefined;
    scheduleLegacyViewBridge(
      {
        plugins: { plugins: {} },
        workspace: { onLayoutReady: (callback: () => void) => { onReady = callback; } },
      } as never,
      registerView,
      migrate,
    );

    onReady?.();
    await vi.waitFor(() => expect(migrate).toHaveBeenCalledOnce());

    expect(registerView).toHaveBeenCalledWith('obsidian-orchestrator:voice-panel');
  });
});
