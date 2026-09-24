import { expect, it } from 'vitest';
import { isConflictingVoicePluginActive } from '../Coexistence';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

it('detects previous Orchestrator and legacy Voice in compatible plugin host shapes', () => {
  expect(isConflictingVoicePluginActive({ plugins: { getPlugin: (id) => id === 'obsidian-orchestrator' ? {} : null } })).toBe(true);
  expect(isConflictingVoicePluginActive({ plugins: { plugins: { 'obsidian-voice': {} } } })).toBe(true);
  expect(isConflictingVoicePluginActive({ plugins: { getPlugin: () => null, plugins: {} } })).toBe(false);
});

it('guards both manual voice connection and wake-word microphone startup', () => {
  const source = readFileSync(resolve('src/VoiceController.ts'), 'utf8');
  expect(source.match(/hasVoicePluginConflict\(\)/g)).toHaveLength(2);
  expect(source).toContain("new Notice('Threads Orchestrator voice controls are paused");
});
