import { describe, expect, it } from 'vitest';
import { siblingPluginDataPath } from '../PluginDataPath';

describe('sibling plugin data path resolution', () => {
  it.each([
    ['obsidian-orchestrator', '.geode/plugins/obsidian-orchestrator/data.json'],
    ['obsidian-voice', '.geode/plugins/obsidian-voice/data.json'],
  ])('uses the Geode manifest directory for %s', (pluginId, expected) => {
    expect(siblingPluginDataPath(pluginId, {
      manifestDir: '.geode/plugins/threads-orchestrator',
    })).toBe(expected);
  });

  it.each([
    ['obsidian-orchestrator', '.obsidian/plugins/obsidian-orchestrator/data.json'],
    ['obsidian-voice', '.obsidian/plugins/obsidian-voice/data.json'],
  ])('falls back to the Obsidian config directory for %s', (pluginId, expected) => {
    expect(siblingPluginDataPath(pluginId, {
      configDir: '.obsidian',
    })).toBe(expected);
  });

  it('prefers manifest location when both host shapes are present', () => {
    expect(siblingPluginDataPath('obsidian-orchestrator', {
      manifestDir: '.geode/plugins/threads-orchestrator/',
      configDir: '.obsidian',
    })).toBe('.geode/plugins/obsidian-orchestrator/data.json');
  });

  it('returns null instead of constructing an undefined path', () => {
    expect(siblingPluginDataPath('obsidian-orchestrator', {})).toBeNull();
  });
});
