export const LEGACY_MIGRATION_VERSION = 1;
const IMPORTED_KEYS = ['voice', 'contextFiles', 'systemPromptExtra', 'autoApplyEdits', 'wakeWordEnabled', 'wakeWord', 'wakeWordThreshold', 'enrollmentEmbeddings', 'silenceTimeoutSecs', 'voiceDisconnectGraceSecs', 'debugLogging'] as const;
export interface MigrationDependencies { readLegacy(): Promise<string | null>; setSecret(id: string, value: string): void }
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
