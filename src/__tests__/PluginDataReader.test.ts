import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readAdapterText } from '../PluginDataReader';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('plugin data reader', () => {
  it('uses Obsidian adapter.read with the exact adapter-relative path', async () => {
    const read = vi.fn().mockResolvedValue('{"voice":"marin"}');
    const getBasePath = vi.fn();

    await expect(readAdapterText(
      { read, getBasePath },
      '.obsidian/plugins/obsidian-orchestrator/data.json',
    )).resolves.toBe('{"voice":"marin"}');

    expect(read).toHaveBeenCalledWith('.obsidian/plugins/obsidian-orchestrator/data.json');
    expect(getBasePath).not.toHaveBeenCalled();
  });

  it('reads through the Geode desktop base path when adapter.read is unavailable', async () => {
    const basePath = await mkdtemp(join(tmpdir(), 'threads-orchestrator-reader-'));
    temporaryDirectories.push(basePath);
    const relativePath = '.geode/plugins/obsidian-orchestrator/data.json';
    const filePath = join(basePath, '.geode', 'plugins', 'obsidian-orchestrator', 'data.json');
    await mkdir(join(basePath, '.geode', 'plugins', 'obsidian-orchestrator'), { recursive: true });
    await writeFile(filePath, '{"voice":"cedar"}', 'utf8');

    await expect(readAdapterText(
      { getBasePath: () => basePath },
      relativePath,
    )).resolves.toBe('{"voice":"cedar"}');
  });

  it('falls back to the Geode filesystem when adapter.read exists but rejects', async () => {
    const basePath = await mkdtemp(join(tmpdir(), 'threads-orchestrator-reader-'));
    temporaryDirectories.push(basePath);
    const relativePath = '.geode/plugins/obsidian-voice/data.json';
    const pluginDirectory = join(basePath, '.geode', 'plugins', 'obsidian-voice');
    await mkdir(pluginDirectory, { recursive: true });
    await writeFile(join(pluginDirectory, 'data.json'), '{"voice":"alloy"}', 'utf8');

    await expect(readAdapterText(
      {
        read: vi.fn().mockRejectedValue(new TypeError('adapter.read is not supported')),
        getBasePath: () => basePath,
      },
      relativePath,
    )).resolves.toBe('{"voice":"alloy"}');
  });

  it('returns null when a Geode sibling data file is missing', async () => {
    const basePath = await mkdtemp(join(tmpdir(), 'threads-orchestrator-reader-'));
    temporaryDirectories.push(basePath);

    await expect(readAdapterText(
      { getBasePath: () => basePath },
      '.geode/plugins/obsidian-voice/data.json',
    )).resolves.toBeNull();
  });

  it.each(['../outside.json', '/tmp/outside.json'])('rejects an unsafe adapter-relative path: %s', async (unsafePath) => {
    await expect(readAdapterText(
      { getBasePath: () => '/safe/vault' },
      unsafePath,
    )).resolves.toBeNull();
  });
});
