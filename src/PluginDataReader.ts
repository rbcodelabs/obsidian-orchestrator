import { readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

interface HostAdapter {
  read?(path: string): Promise<string>;
  getBasePath?(): string;
}

function safeFilesystemPath(basePath: string, adapterRelativePath: string): string | null {
  if (isAbsolute(adapterRelativePath)) return null;

  const targetPath = resolve(basePath, adapterRelativePath);
  const pathFromBase = relative(resolve(basePath), targetPath);
  if (
    pathFromBase === '..' ||
    pathFromBase.startsWith(`..${sep}`) ||
    isAbsolute(pathFromBase)
  ) return null;

  return targetPath;
}

export async function readAdapterText(
  adapter: HostAdapter,
  adapterRelativePath: string,
): Promise<string | null> {
  if (typeof adapter.read === 'function') {
    try {
      return await adapter.read(adapterRelativePath);
    } catch {
      // Desktop hosts with a filesystem base path can still read below.
    }
  }

  if (typeof adapter.getBasePath !== 'function') return null;

  try {
    const filePath = safeFilesystemPath(adapter.getBasePath(), adapterRelativePath);
    return filePath ? await readFile(filePath, 'utf8') : null;
  } catch {
    return null;
  }
}
