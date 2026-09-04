import { expect, it } from 'vitest';
import { isLegacyVoiceActive } from '../Coexistence';

it('detects legacy Voice in Obsidian and Geode-compatible plugin host shapes', () => {
  expect(isLegacyVoiceActive({ plugins: { getPlugin: () => ({}) } })).toBe(true);
  expect(isLegacyVoiceActive({ plugins: { plugins: { 'obsidian-voice': {} } } })).toBe(true);
  expect(isLegacyVoiceActive({ plugins: { getPlugin: () => null, plugins: {} } })).toBe(false);
});
