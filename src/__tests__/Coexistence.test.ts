import { expect, it } from 'vitest';
import { isLegacyVoiceActive } from '../Coexistence';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

it('detects legacy Voice in Obsidian and Geode-compatible plugin host shapes', () => {
  expect(isLegacyVoiceActive({ plugins: { getPlugin: () => ({}) } })).toBe(true);
  expect(isLegacyVoiceActive({ plugins: { plugins: { 'obsidian-voice': {} } } })).toBe(true);
  expect(isLegacyVoiceActive({ plugins: { getPlugin: () => null, plugins: {} } })).toBe(false);
});

it('guards both manual voice connection and wake-word microphone startup', () => {
  const source = readFileSync(resolve('src/VoiceController.ts'), 'utf8');
  expect(source.match(/hasLegacyVoiceConflict\(\)/g)).toHaveLength(2);
  expect(source).toContain("new Notice('Orchestrator voice controls are paused");
});
