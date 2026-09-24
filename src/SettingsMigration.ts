export const LEGACY_MIGRATION_VERSION = 1;
const IMPORTED_KEYS = ['voice', 'contextFiles', 'systemPromptExtra', 'autoApplyEdits', 'wakeWordEnabled', 'wakeWord', 'wakeWordThreshold', 'enrollmentEmbeddings', 'silenceTimeoutSecs', 'voiceDisconnectGraceSecs', 'debugLogging'] as const;
export interface MigrationDependencies { readLegacy(): Promise<string | null>; setSecret(id: string, value: string): void }
export type SettingsSource = 'current' | 'previous-orchestrator' | 'legacy-voice' | 'defaults';
export interface SettingsSourceDependencies {
  readPreviousOrchestrator(): Promise<string | null>;
  readLegacyVoice(): Promise<string | null>;
}

function parseSettings(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

export async function selectSettingsSource(
  currentData: Record<string, unknown> | null | undefined,
  dependencies: SettingsSourceDependencies,
): Promise<{ data: Record<string, unknown>; source: SettingsSource }> {
  if (currentData && Object.keys(currentData).length > 0) {
    return { data: currentData, source: 'current' };
  }

  const previousOrchestrator = parseSettings(await dependencies.readPreviousOrchestrator());
  if (previousOrchestrator && Object.keys(previousOrchestrator).length > 0) {
    return { data: previousOrchestrator, source: 'previous-orchestrator' };
  }

  const legacyVoice = parseSettings(await dependencies.readLegacyVoice());
  if (legacyVoice && Object.keys(legacyVoice).length > 0) {
    return { data: legacyVoice, source: 'legacy-voice' };
  }

  return { data: {}, source: 'defaults' };
}

export async function migrateLegacyVoiceSettings(ownData: Record<string, unknown> | null | undefined, dependencies: MigrationDependencies): Promise<{ settings: Record<string, unknown>; imported: boolean }> {
  const existing = { ...(ownData ?? {}) };
  if (typeof existing.openaiApiKey === 'string' && existing.openaiApiKey.trim()) dependencies.setSecret('openai-api-key', existing.openaiApiKey.trim());
  delete existing.openaiApiKey;
  if (Object.keys(existing).length > 0) return { settings: { ...existing, legacyVoiceMigration: LEGACY_MIGRATION_VERSION }, imported: false };
  let parsed: Record<string, unknown> | null = null;
  try { const raw = await dependencies.readLegacy(); if (raw) parsed = JSON.parse(raw) as Record<string, unknown>; } catch { parsed = null; }
  const settings: Record<string, unknown> = { legacyVoiceMigration: LEGACY_MIGRATION_VERSION };
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { settings, imported: false };
  for (const key of IMPORTED_KEYS) if (parsed[key] !== undefined) settings[key] = parsed[key];
  if (typeof parsed.openaiApiKey === 'string' && parsed.openaiApiKey.trim()) dependencies.setSecret('openai-api-key', parsed.openaiApiKey.trim());
  return { settings, imported: true };
}
