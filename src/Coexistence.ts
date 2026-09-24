interface PluginRegistry { getPlugin?(id: string): unknown; plugins?: Record<string, unknown> }
const CONFLICTING_PLUGIN_IDS = ['obsidian-orchestrator', 'obsidian-voice'] as const;

export function isConflictingVoicePluginActive(app: { plugins?: PluginRegistry }): boolean {
  const registry = app.plugins;
  return CONFLICTING_PLUGIN_IDS.some((id) =>
    !!(registry?.getPlugin?.(id) ?? registry?.plugins?.[id]),
  );
}
