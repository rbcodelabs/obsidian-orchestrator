import type { ClaudeThreadsApiV1 } from './ClaudeThreadsApiTypes';

interface EventRef {}
interface WorkspaceHost { on(name: string, listener: (payload: unknown) => void): EventRef; offref?(ref: EventRef): void }
interface PluginHost { getPlugin?(id: string): unknown; plugins?: Record<string, unknown> }
interface AppHost { plugins?: PluginHost; workspace: WorkspaceHost }

export class ThreadsApiUnavailableError extends Error {
  readonly code = 'PLUGIN_UNAVAILABLE';
  constructor(message = 'Claude Threads API v1 is unavailable. Install or enable a compatible Claude Threads version.') { super(message); this.name = 'ThreadsApiUnavailableError'; }
}

export class ClaudeThreadsApiClient {
  private api: ClaudeThreadsApiV1 | null = null;
  private refs: EventRef[] = [];
  private listeners = new Set<(api: ClaudeThreadsApiV1 | null) => void>();
  private started = false;
  private disposed = false;
  constructor(private readonly app: AppHost) {}
  start(): void {
    if (this.started || this.disposed) return;
    this.started = true; this.bindDiscovered();
    this.refs.push(
      this.app.workspace.on('claude-threads:api-ready', () => this.bindDiscovered()),
      this.app.workspace.on('claude-threads:api-stopping', payload => this.handleStopping(payload)),
    );
  }
  current(): ClaudeThreadsApiV1 | null { return this.api; }
  requireApi(): ClaudeThreadsApiV1 { if (!this.api) throw new ThreadsApiUnavailableError(); return this.api; }
  onChange(listener: (api: ClaudeThreadsApiV1 | null) => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const ref of this.refs) this.app.workspace.offref?.(ref);
    this.refs = []; this.setApi(null); this.listeners.clear();
  }
  private bindDiscovered(): void {
    const plugins = this.app.plugins;
    const plugin = plugins?.getPlugin?.('claude-threads') ?? plugins?.plugins?.['claude-threads'];
    const candidate = (plugin as { api?: { v1?: unknown } } | null)?.api?.v1;
    this.setApi(isApiV1(candidate) ? candidate : null);
  }
  private handleStopping(payload: unknown): void {
    const generation = (payload as { generation?: unknown } | null)?.generation;
    if (typeof generation === 'string' && generation === this.api?.generation) this.setApi(null);
  }
  private setApi(next: ClaudeThreadsApiV1 | null): void {
    if (this.api === next || this.api?.generation === next?.generation) return;
    this.api = next;
    for (const listener of [...this.listeners]) listener(next);
  }
}

function isApiV1(value: unknown): value is ClaudeThreadsApiV1 {
  if (!value || typeof value !== 'object') return false;
  const api = value as Partial<ClaudeThreadsApiV1>;
  return api.apiVersion === 1 && typeof api.generation === 'string' && typeof api.threads?.list === 'function' && typeof api.threads?.subscribe === 'function' && typeof api.orchestrators?.list === 'function' && typeof api.agentTools?.createBundle === 'function';
}
