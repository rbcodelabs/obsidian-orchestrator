import { isPluginActive } from './Coexistence';
import { LEGACY_ORCHESTRATOR_VOICE_VIEW_TYPE } from './PluginIdentity';

interface LegacyBridgeHost {
  plugins?: {
    getPlugin?(id: string): unknown;
    plugins?: Record<string, unknown>;
  };
  workspace: {
    onLayoutReady(callback: () => void): void;
  };
}

export function scheduleLegacyViewBridge(
  app: LegacyBridgeHost,
  registerView: (type: string) => void,
  migrateView: () => Promise<void>,
): void {
  app.workspace.onLayoutReady(() => {
    // Check after all enabled plugins have had a chance to load. Claiming this
    // global type while the previous plugin owns it makes both plugins fail.
    if (isPluginActive(app, 'obsidian-orchestrator')) return;

    registerView(LEGACY_ORCHESTRATOR_VOICE_VIEW_TYPE);
    migrateView().catch((error) => {
      console.error('[Threads Orchestrator] legacy view migration failed:', error);
    });
  });
}
