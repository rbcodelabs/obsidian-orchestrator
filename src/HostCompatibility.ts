/** Geode's advertised API level predates secret storage, which it backports. */
export function assertHostCompatibility(app: unknown, secretComponent: unknown): void {
  const storage = (app as { secretStorage?: { getSecret?: unknown; setSecret?: unknown } } | null)?.secretStorage;
  if (typeof storage?.getSecret !== 'function' || typeof storage?.setSecret !== 'function' || typeof secretComponent !== 'function') {
    throw new Error('Orchestrator requires secret-storage APIs. Use Obsidian 1.11.4+ or a compatible Geode release (verified with Geode 0.22.7).');
  }
}
