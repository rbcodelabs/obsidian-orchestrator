import { describe, expect, it, vi } from 'vitest';
import { installLegacyViewBridge } from '../LegacyViewBridge';

function workspaceHarness() {
  let onReady: (() => void) | undefined;
  return {
    workspace: { onLayoutReady: (callback: () => void) => { onReady = callback; } },
    ready: () => onReady?.(),
  };
}

describe('legacy view bridge registration', () => {
  it('registers immediately before layout restoration when Obsidian proves the old plugin is disabled', async () => {
    const harness = workspaceHarness();
    const registerView = vi.fn();
    const migrate = vi.fn().mockResolvedValue(undefined);
    const installed = installLegacyViewBridge(
      { plugins: { enabledPlugins: new Set() }, workspace: harness.workspace } as never,
      registerView,
      migrate,
    );

    expect(installed).toBe(true);
    expect(registerView).toHaveBeenCalledWith('obsidian-orchestrator:voice-panel');
    expect(migrate).not.toHaveBeenCalled();
    harness.ready();
    await vi.waitFor(() => expect(migrate).toHaveBeenCalledOnce());
  });

  it('does not register when Obsidian has the old plugin enabled but not loaded yet', () => {
    const harness = workspaceHarness();
    const registerView = vi.fn();
    const installed = installLegacyViewBridge(
      { plugins: { enabledPlugins: new Set(['obsidian-orchestrator']), getPlugin: vi.fn(() => null) }, workspace: harness.workspace } as never,
      registerView,
      vi.fn(),
    );

    expect(installed).toBe(false);
    expect(registerView).not.toHaveBeenCalled();
  });

  it.each([true, false])('uses Geode enabled state before plugin load order resolves (%s)', (enabled) => {
    const harness = workspaceHarness();
    const registerView = vi.fn();
    const installed = installLegacyViewBridge(
      { pluginManager: { isEnabled: (id: string) => id === 'obsidian-orchestrator' && enabled }, workspace: harness.workspace } as never,
      registerView,
      vi.fn().mockResolvedValue(undefined),
    );

    expect(installed).toBe(!enabled);
    expect(registerView).toHaveBeenCalledTimes(enabled ? 0 : 1);
  });

  it('does not claim the legacy type when enabled state cannot be established', () => {
    const harness = workspaceHarness();
    const registerView = vi.fn();
    const installed = installLegacyViewBridge(
      { plugins: { plugins: {} }, workspace: harness.workspace } as never,
      registerView,
      vi.fn(),
    );

    expect(installed).toBe(false);
    expect(registerView).not.toHaveBeenCalled();
  });

  it.each([
    { plugins: { getPlugin: (id: string) => id === 'obsidian-orchestrator' ? {} : null } },
    { plugins: { plugins: { 'obsidian-orchestrator': {} } } },
  ])('does not claim the type when the old plugin is already active', (registry) => {
    const harness = workspaceHarness();
    const registerView = vi.fn();
    const installed = installLegacyViewBridge(
      { ...registry, workspace: harness.workspace } as never,
      registerView,
      vi.fn(),
    );

    expect(installed).toBe(false);
    expect(registerView).not.toHaveBeenCalled();
  });
});
