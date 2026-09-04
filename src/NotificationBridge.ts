import type { ClaudeThreadsApiV1, Disposable, PublicThreadEvent, ThreadSnapshot } from './ClaudeThreadsApiTypes';

interface NotificationSession { injectNotification(threadId: string, text: string): void }
export class NotificationBridge {
  private watchedThreads = new Set<string>();
  private subscription: Disposable | null = null;
  private session: NotificationSession | null = null;
  private api: ClaudeThreadsApiV1 | null = null;
  private debug = false;
  connect(api: ClaudeThreadsApiV1, session: NotificationSession, debug = false): void {
    this.disconnect(false); this.api = api; this.session = session; this.debug = debug;
    this.subscription = api.threads.subscribe(event => { void this.handleEvent(event); });
  }
  disconnect(clearWatches = true): void {
    this.subscription?.dispose(); this.subscription = null; this.session = null; this.api = null;
    if (clearWatches) this.watchedThreads.clear(); this.debug = false;
  }
  watch(threadId: string): void { this.watchedThreads.add(threadId); }
  async watchAll(): Promise<void> { for (const thread of await this.api?.threads.list() ?? []) this.watchedThreads.add(thread.id); }
  unwatch(threadId?: string): void { if (threadId) this.watchedThreads.delete(threadId); else this.watchedThreads.clear(); }
  isWatching(threadId: string): boolean { return this.watchedThreads.has(threadId); }
  private async handleEvent(event: PublicThreadEvent): Promise<void> {
    if (!this.watchedThreads.has(event.threadId) || !this.session || !this.api) return;
    if (event.kind === 'thread.removed' || event.kind === 'run.started') return;
    let thread: ThreadSnapshot | null = null;
    try { thread = await this.api.threads.get(event.threadId); } catch { return; }
    if (!thread || !this.session) return;
    const title = thread.title || event.threadId.slice(0, 8);
    const eventMessage = event.kind === 'message.completed' ? event.message : event.kind === 'run.completed' ? event.finalMessage : undefined;
    const lastMessage = eventMessage ?? thread.messages.at(-1);
    const preview = lastMessage ? String(lastMessage.content).slice(0, 300) : '';
    let text: string | null = null;
    if (event.kind === 'run.completed') text = `[Thread STATUS=done id="${title}"] Final message: ${preview || '(no message)'}. Briefly acknowledge to the user.`;
    else if (event.kind === 'run.failed') text = `[Thread STATUS=error id="${title}"] Error: ${event.error.message}. Tell the user.`;
    else if (event.kind === 'message.completed' && preview) {
      const status = thread.isRunning ? 'working' : 'idle';
      const directive = thread.isRunning ? 'Agent is STILL WORKING — narrate briefly to the user (1 short sentence), DO NOT send a ct_send_message reply yet.' : 'Agent appears idle — acknowledge to the user.';
      text = `[Thread STATUS=${status} id="${title}"] Update: ${preview}. ${directive}`;
    }
    if (this.debug) console.debug(`[Orchestrator Bridge] event=${event.kind} thread=${event.threadId} notification=${text ? 'yes' : 'no'}`);
    if (text) this.session.injectNotification(event.threadId, text);
  }
}
