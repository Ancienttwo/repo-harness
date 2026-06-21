export interface McpSessionClosableTransport {
  sessionId?: string;
  close(): Promise<void>;
}

export interface McpSessionRecord<TTransport extends McpSessionClosableTransport = McpSessionClosableTransport> {
  readonly transport: TTransport;
  readonly createdAt: number;
  lastSeenAt: number;
}

export interface McpSessionStoreOptions {
  readonly ttlMs: number;
  readonly maxSessions: number;
  readonly now?: () => number;
}

export class McpSessionStore<TTransport extends McpSessionClosableTransport = McpSessionClosableTransport> {
  private readonly records = new Map<string, McpSessionRecord<TTransport>>();
  private readonly now: () => number;

  constructor(private readonly options: McpSessionStoreOptions) {
    this.now = options.now ?? Date.now;
  }

  get size(): number {
    return this.records.size;
  }

  get ttlMs(): number {
    return this.options.ttlMs;
  }

  get maxSessions(): number {
    return this.options.maxSessions;
  }

  canCreate(): boolean {
    this.cleanupExpired();
    return this.records.size < this.options.maxSessions;
  }

  set(sessionId: string, transport: TTransport): McpSessionRecord<TTransport> {
    const timestamp = this.now();
    const record = { transport, createdAt: timestamp, lastSeenAt: timestamp };
    this.records.set(sessionId, record);
    return record;
  }

  get(sessionId: string | undefined): McpSessionRecord<TTransport> | undefined {
    this.cleanupExpired();
    if (!sessionId) return undefined;
    const record = this.records.get(sessionId);
    if (!record) return undefined;
    record.lastSeenAt = this.now();
    return record;
  }

  delete(sessionId: string | undefined): McpSessionRecord<TTransport> | undefined {
    if (!sessionId) return undefined;
    const record = this.records.get(sessionId);
    if (!record) return undefined;
    this.records.delete(sessionId);
    return record;
  }

  cleanupExpired(): number {
    const now = this.now();
    let removed = 0;
    for (const [sessionId, record] of this.records) {
      if (now - record.lastSeenAt <= this.options.ttlMs) continue;
      this.records.delete(sessionId);
      removed += 1;
      void record.transport.close().catch(() => undefined);
    }
    return removed;
  }

  async closeAndDelete(sessionId: string | undefined): Promise<boolean> {
    const record = this.delete(sessionId);
    if (!record) return false;
    await record.transport.close().catch(() => undefined);
    return true;
  }

  async closeAll(): Promise<void> {
    const records = Array.from(this.records.entries());
    this.records.clear();
    await Promise.all(records.map(([, record]) => record.transport.close().catch(() => undefined)));
  }
}
