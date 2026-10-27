import type { Logger } from '@pretoscop/config/logger';
import { type Db, requestLog } from '@pretoscop/db';
import type { RequestLogEntry, RequestLogSink } from '@pretoscop/fetch';

/** Buffered `request_log` writer (30-day retention). Errors are logged, never thrown. */
export class PgRequestLogSink implements RequestLogSink {
  private buffer: RequestLogEntry[] = [];
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly db: Db,
    private readonly log: Logger,
    private readonly maxBuffer = 50,
    private readonly flushMs = 2000,
  ) {}

  write(entry: RequestLogEntry): void {
    this.buffer.push(entry);
    if (this.buffer.length >= this.maxBuffer) void this.flush();
    else if (!this.timer) this.timer = setTimeout(() => void this.flush(), this.flushMs);
  }

  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const batch = this.buffer.splice(0);
    if (batch.length === 0) return;
    try {
      await this.db.insert(requestLog).values(
        batch.map((e) => ({
          ts: e.ts,
          host: e.host,
          url: e.url.slice(0, 2000),
          method: e.method,
          status: e.status ?? null,
          durationMs: e.durationMs ?? null,
          bytes: e.bytes ?? null,
          purpose: e.purpose ?? null,
          shopSlug: e.shopSlug ?? null,
          channel: e.channel ?? 'direct',
          blocked: e.blocked ?? false,
          blockReason: e.blockReason ?? null,
          blockDetail: e.blockDetail?.slice(0, 500) ?? null,
          skipped: e.skipped ?? null,
          error: e.error?.slice(0, 500) ?? null,
          errorCode: e.errorCode ?? null,
          robotsGroup: e.robotsGroup ?? null,
          robotsIgnoredGroups: e.robotsIgnoredGroups ?? null,
          runId: e.runId === undefined || e.runId === null ? null : Number(e.runId),
          sourceId: e.sourceId === undefined || e.sourceId === null ? null : Number(e.sourceId),
          waitMs: e.waitMs ?? null,
          attempt: e.attempt ?? null,
          hop: e.hop ?? null,
          contentType: e.contentType?.slice(0, 120) ?? null,
          notModified: e.notModified ?? null,
        })),
      );
    } catch (err) {
      this.log.error({ err, entries: batch.length }, 'request_log write failed');
    }
  }
}
