import { isPluginActive } from './Coexistence';
import { LEGACY_ORCHESTRATOR_VOICE_VIEW_TYPE } from './PluginIdentity';

interface LegacyBridgeHost {
  plugins?: {
    getPlugin?(id: string): unknown;
    plugins?: Record<string, unknown>;
    enabledPlugins?: { has(id: string): boolean } | readonly string[];
  };
  pluginManager?: { isEnabled(id: string): boolean };
  workspace: {
    onLayoutReady(callback: () => void): void;
  };
}

function previousPluginEnabled(app: LegacyBridgeHost): boolean | null {
  if (isPluginActive(app, 'obsidian-orchestrator')) return true;

  if (app.pluginManager?.isEnabled) {
    return app.pluginManager.isEnabled('obsidian-orchestrator');
  }

  const enabledPlugins = app.plugins?.enabledPlugins;
  if (Array.isArray(enabledPlugins)) return enabledPlugins.includes('obsidian-orchestrator');
  if (enabledPlugins && 'has' in enabledPlugins) return enabledPlugins.has('obsidian-orchestrator');
  return null;
}

export function installLegacyViewBridge(
  app: LegacyBridgeHost,
  registerView: (type: string) => void,
  migrateView: () => Promise<void>,
): boolean {
  // Registration must happen during onload so the host can restore persisted
  // leaves. Only claim the global legacy type when a supported host API proves
  // the old plugin is disabled, independent of plugin load order.
  if (previousPluginEnabled(app) !== false) return false;

  registerView(LEGACY_ORCHESTRATOR_VOICE_VIEW_TYPE);

  app.workspace.onLayoutReady(() => {
    migrateView().catch((error) => {
      console.error('[Threads Orchestrator] legacy view migration failed:', error);
    });
  });
  return true;
}
