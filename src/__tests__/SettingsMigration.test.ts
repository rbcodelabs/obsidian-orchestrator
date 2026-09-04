import { describe, expect, it, vi } from 'vitest';
import { migrateLegacyVoiceSettings } from '../SettingsMigration';

const legacy = { voice: 'cedar', contextFiles: ['Notes/a.md'], systemPromptExtra: 'brief', autoApplyEdits: false, wakeWordThreshold: .6, enrollmentEmbeddings: [[1, 2]], silenceTimeoutSecs: 22, voiceDisconnectGraceSecs: 6, debugLogging: true, openaiApiKey: 'sk-secret-value' };

describe('legacy Voice settings migration', () => {
  it('imports supported first-run settings and moves the secret without retaining or leaking it', async () => {
    const setSecret = vi.fn();
    const result = await migrateLegacyVoiceSettings({}, { readLegacy: vi.fn().mockResolvedValue(JSON.stringify(legacy)), setSecret });
    expect(result.settings).toMatchObject({ voice: 'cedar', contextFiles: ['Notes/a.md'], systemPromptExtra: 'brief', autoApplyEdits: false, wakeWordThreshold: .6, enrollmentEmbeddings: [[1, 2]], silenceTimeoutSecs: 22, voiceDisconnectGraceSecs: 6, debugLogging: true });
    expect(result.settings).not.toHaveProperty('openaiApiKey');
    expect(JSON.stringify(result.settings)).not.toContain('sk-secret-value');
    expect(setSecret).toHaveBeenCalledWith('openai-api-key', 'sk-secret-value');
  });

  it('never overwrites existing Orchestrator settings', async () => {
    const readLegacy = vi.fn();
    const result = await migrateLegacyVoiceSettings({ voice: 'marin', legacyVoiceMigration: 1 }, { readLegacy, setSecret: vi.fn() });
    expect(result.settings.voice).toBe('marin');
    expect(readLegacy).not.toHaveBeenCalled();
  });

  it('sanitizes an existing plaintext key into shared SecretStorage', async () => {
    const setSecret = vi.fn();
    const result = await migrateLegacyVoiceSettings({ voice: 'marin', openaiApiKey: 'sk-existing' }, { readLegacy: vi.fn(), setSecret });
    expect(result.settings).not.toHaveProperty('openaiApiKey');
    expect(setSecret).toHaveBeenCalledWith('openai-api-key', 'sk-existing');
  });

  it.each([null, '{bad json'])('fails safely when legacy settings are absent or malformed', async (raw) => {
    const result = await migrateLegacyVoiceSettings({}, { readLegacy: vi.fn().mockResolvedValue(raw), setSecret: vi.fn() });
    expect(result.settings.legacyVoiceMigration).toBe(1);
    expect(result.imported).toBe(false);
  });
});
