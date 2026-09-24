interface PluginRegistry { getPlugin?(id: string): unknown; plugins?: Record<string, unknown> }
interface PluginManager { getPlugin?(id: string): unknown; isEnabled?(id: string): boolean }
interface PluginHost { plugins?: PluginRegistry; pluginManager?: PluginManager }
const CONFLICTING_PLUGIN_IDS = ['obsidian-orchestrator', 'obsidian-voice'] as const;

export function isPluginActive(app: PluginHost, pluginId: string): boolean {
  const registry = app.plugins;
  return !!(
    registry?.getPlugin?.(pluginId) ??
    registry?.plugins?.[pluginId] ??
    app.pluginManager?.getPlugin?.(pluginId) ??
    app.pluginManager?.isEnabled?.(pluginId)
  );
}

export function isConflictingVoicePluginActive(app: PluginHost): boolean {
  return CONFLICTING_PLUGIN_IDS.some((id) => isPluginActive(app, id));
}
