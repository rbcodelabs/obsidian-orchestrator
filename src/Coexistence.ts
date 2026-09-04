interface PluginRegistry { getPlugin?(id: string): unknown; plugins?: Record<string, unknown> }
export function isLegacyVoiceActive(app: { plugins?: PluginRegistry }): boolean {
  const registry = app.plugins;
  return !!(registry?.getPlugin?.('obsidian-voice') ?? registry?.plugins?.['obsidian-voice']);
}
