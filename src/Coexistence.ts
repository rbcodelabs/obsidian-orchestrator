interface PluginRegistry { getPlugin?(id: string): unknown; plugins?: Record<string, unknown> }
const CONFLICTING_PLUGIN_IDS = ['obsidian-orchestrator', 'obsidian-voice'] as const;

export function isPluginActive(app: { plugins?: PluginRegistry }, pluginId: string): boolean {
  const registry = app.plugins;
  return !!(registry?.getPlugin?.(pluginId) ?? registry?.plugins?.[pluginId]);
}

export function isConflictingVoicePluginActive(app: { plugins?: PluginRegistry }): boolean {
  return CONFLICTING_PLUGIN_IDS.some((id) => isPluginActive(app, id));
}
