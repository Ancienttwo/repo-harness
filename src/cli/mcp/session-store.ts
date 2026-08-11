export interface McpSessionClosableTransport {
  sessionId?: string;
  close(): Promise<void>;
}

export interface McpSessionRecord<TTransport extends McpSessionClosableTransport = McpSessionClosableTransport> {
  readonly transport: TTransport;
  readonly createdAt: number;
  lastSeenAt: number;
  activeRequests: number;
}

export interface McpSessionStoreOptions {
  readonly ttlMs: number;
  readonly maxSessions: number;
  readonly now?: () => number;
}

export interface McpSessionStoreMetrics {
  readonly created: number;
  readonly closed: number;
  readonly expired: number;
  readonly evicted: number;
}

export interface McpSessionLease<TTransport extends McpSessionClosableTransport = McpSessionClosableTransport> {
  readonly record: McpSessionRecord<TTransport>;
  release(): void;
}

export interface McpSessionReservation<TTransport extends McpSessionClosableTransport = McpSessionClosableTransport> {
  commit(sessionId: string, transport: TTransport): McpSessionRecord<TTransport>;
  release(): void;
}

type SessionRemovalReason = 'closed' | 'expired' | 'evicted';

export class McpSessionStore<TTransport extends McpSessionClosableTransport = McpSessionClosableTransport> {
  private readonly records = new Map<string, McpSessionRecord<TTransport>>();
  private readonly now: () => number;
  private pendingReservations = 0;
  private createdCount = 0;
  private closedCount = 0;
  private expiredCount = 0;
  private evictedCount = 0;

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

  get metrics(): McpSessionStoreMetrics {
    return {
      created: this.createdCount,
      closed: this.closedCount,
      expired: this.expiredCount,
      evicted: this.evictedCount,
    };
  }

  reserveForCreate(): McpSessionReservation<TTransport> | undefined {
    this.cleanupExpired();
    if (this.records.size + this.pendingReservations >= this.options.maxSessions) {
      const oldestIdle = Array.from(this.records.entries())
        .filter(([, record]) => record.activeRequests === 0)
        .sort((left, right) => left[1].lastSeenAt - right[1].lastSeenAt || left[1].createdAt - right[1].createdAt)[0];
      if (!oldestIdle) return undefined;
      this.remove(oldestIdle[0], 'evicted', true);
    }

    this.pendingReservations += 1;
    let settled = false;
    return {
      commit: (sessionId, transport) => {
        if (settled) throw new Error('MCP_SESSION_RESERVATION_SETTLED');
        settled = true;
        this.pendingReservations -= 1;
        return this.set(sessionId, transport);
      },
      release: () => {
        if (settled) return;
        settled = true;
        this.pendingReservations -= 1;
      },
    };
  }

  set(sessionId: string, transport: TTransport): McpSessionRecord<TTransport> {
    const timestamp = this.now();
    const record = { transport, createdAt: timestamp, lastSeenAt: timestamp, activeRequests: 0 };
    this.records.set(sessionId, record);
    this.createdCount += 1;
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

  acquire(sessionId: string | undefined): McpSessionLease<TTransport> | undefined {
    const record = this.get(sessionId);
    if (!record) return undefined;
    record.activeRequests += 1;
    let released = false;
    return {
      record,
      release: () => {
        if (released) return;
        released = true;
        record.activeRequests -= 1;
        record.lastSeenAt = this.now();
      },
    };
  }

  delete(sessionId: string | undefined): McpSessionRecord<TTransport> | undefined {
    if (!sessionId) return undefined;
    return this.remove(sessionId, 'closed', false);
  }

  cleanupExpired(): number {
    const now = this.now();
    let removed = 0;
    for (const [sessionId, record] of this.records) {
      if (record.activeRequests > 0 || now - record.lastSeenAt <= this.options.ttlMs) continue;
      this.remove(sessionId, 'expired', true);
      removed += 1;
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
    const records = Array.from(this.records.keys())
      .map((sessionId) => this.remove(sessionId, 'closed', false))
      .filter((record): record is McpSessionRecord<TTransport> => record !== undefined);
    await Promise.all(records.map((record) => record.transport.close().catch(() => undefined)));
  }

  private remove(sessionId: string, reason: SessionRemovalReason, closeInBackground: boolean): McpSessionRecord<TTransport> | undefined {
    const record = this.records.get(sessionId);
    if (!record) return undefined;
    this.records.delete(sessionId);
    if (reason === 'closed') this.closedCount += 1;
    if (reason === 'expired') this.expiredCount += 1;
    if (reason === 'evicted') this.evictedCount += 1;
    if (closeInBackground) void record.transport.close().catch(() => undefined);
    return record;
  }
}
