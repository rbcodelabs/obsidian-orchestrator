interface PluginPathContext {
  manifestDir?: string;
  configDir?: string;
}

function normalizeDirectory(directory: string): string {
  return directory.replace(/\\/g, '/').replace(/\/+$/, '');
}

export function siblingPluginDataPath(
  pluginId: string,
  context: PluginPathContext,
): string | null {
  if (context.manifestDir) {
    const currentPluginDir = normalizeDirectory(context.manifestDir);
    const separator = currentPluginDir.lastIndexOf('/');
    const pluginsDir = separator >= 0 ? currentPluginDir.slice(0, separator) : '';
    return `${pluginsDir ? `${pluginsDir}/` : ''}${pluginId}/data.json`;
  }

  if (context.configDir) {
    return `${normalizeDirectory(context.configDir)}/plugins/${pluginId}/data.json`;
  }

  return null;
}
