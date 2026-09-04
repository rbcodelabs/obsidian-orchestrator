import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Orchestrator package identity', () => {
  it('uses a non-colliding plugin ID and consistent 0.1.0 metadata', () => {
    const manifest = JSON.parse(readFileSync(resolve('manifest.json'), 'utf8'));
    const pkg = JSON.parse(readFileSync(resolve('package.json'), 'utf8'));
    const versions = JSON.parse(readFileSync(resolve('versions.json'), 'utf8'));
    expect(manifest).toMatchObject({ id: 'obsidian-orchestrator', name: 'Orchestrator', version: '0.1.0' });
    expect(manifest.description.toLowerCase()).toContain('voice');
    expect(pkg).toMatchObject({ name: 'obsidian-orchestrator', version: '0.1.0' });
    expect(versions).toEqual({ '0.1.0': manifest.minAppVersion });
  });

  it('registers non-colliding view and command IDs', () => {
    const main = readFileSync(resolve('src/main.ts'), 'utf8');
    const view = readFileSync(resolve('src/VoiceView.ts'), 'utf8');
    expect(main).toContain("id: 'open-orchestrator-panel'");
    expect(main).toContain("id: 'toggle-orchestrator-voice'");
    expect(view).toContain("'obsidian-orchestrator:voice-panel'");
  });
});
