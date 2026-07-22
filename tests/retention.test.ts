import { describe, it, expect } from 'vitest';
import { runRetention, DEFAULT_RETENTION } from '../packages/server/src/scheduled/retention';
import type { Env } from '../packages/server/src/bindings';
import { fakeD1 } from './helpers/d1';

// Retention keeps PHI from accumulating (PDPA 2026). Two operations, each
// independent and idempotent; the pass must never throw (it runs unattended).

const DAY = 24 * 60 * 60;
const NOW = 1_700_000_000;

const envWith = (db: unknown) => ({ DB: db }) as unknown as Env;

/** run() returns { meta: { changes } } — let the spy report affected rows. */
function d1WithChanges(otp: number, sessions: number) {
  const d1 = fakeD1();
  // The spy's run() returns { success: true } with no meta; patch prepare so
  // each statement reports the right change count by SQL.
  const realPrepare = d1.DB.prepare.bind(d1.DB);
  d1.DB.prepare = (sql: string) => {
    const stmt = realPrepare(sql) as { bind: (...a: unknown[]) => unknown; run: () => Promise<unknown> };
    const origBind = stmt.bind.bind(stmt);
    stmt.bind = (...a: unknown[]) => {
      const bound = origBind(...a) as { run: () => Promise<unknown> };
      bound.run = async () => ({
        success: true,
        meta: { changes: sql.includes('email_otps') ? otp : sessions },
      });
      return bound;
    };
    return stmt as never;
  };
  return d1;
}

describe('runRetention — queries', () => {
  it('purges OTPs older than the configured TTL, parameterized', async () => {
    const d1 = fakeD1();
    await runRetention(envWith(d1.DB), NOW);
    const q = d1.find('DELETE FROM email_otps')!;
    expect(q.sql).toContain('issued_at < ?');
    expect(q.params).toEqual([NOW - DEFAULT_RETENTION.otpTtlDays * DAY]);
  });

  it('compacts (not deletes) idle session transcripts, keeping the row', async () => {
    const d1 = fakeD1();
    await runRetention(envWith(d1.DB), NOW);
    const q = d1.find('UPDATE sessions')!;
    expect(q.sql).toContain("SET messages = '[]'");
    expect(q.sql).not.toContain('DELETE FROM sessions');
    // Only rows still carrying a transcript, older than the window.
    expect(q.sql).toContain("messages != '[]'");
    expect(q.sql).toContain('updated_at < ?');
    expect(q.params).toEqual([NOW - DEFAULT_RETENTION.sessionTtlDays * DAY]);
  });

  it('honours a custom config', async () => {
    const d1 = fakeD1();
    await runRetention(envWith(d1.DB), NOW, { otpTtlDays: 1, sessionTtlDays: 30 });
    expect(d1.find('DELETE FROM email_otps')!.params).toEqual([NOW - 1 * DAY]);
    expect(d1.find('UPDATE sessions')!.params).toEqual([NOW - 30 * DAY]);
  });
});

describe('runRetention — counts and resilience', () => {
  it('reports affected-row counts from D1 meta.changes', async () => {
    const d1 = d1WithChanges(7, 3);
    const res = await runRetention(envWith(d1.DB), NOW);
    expect(res).toEqual({ otpsPurged: 7, sessionsCompacted: 3, errors: [] });
  });

  it('records an error but still runs the other operation', async () => {
    // Fail only the OTP delete; session compaction must still run.
    const d1 = fakeD1();
    const realPrepare = d1.DB.prepare.bind(d1.DB);
    d1.DB.prepare = (sql: string) => {
      const stmt = realPrepare(sql) as { bind: (...a: unknown[]) => unknown };
      const origBind = stmt.bind.bind(stmt);
      stmt.bind = (...a: unknown[]) => {
        const bound = origBind(...a) as { run: () => Promise<unknown> };
        if (sql.includes('email_otps')) bound.run = async () => { throw new Error('otp boom'); };
        return bound;
      };
      return stmt as never;
    };
    const res = await runRetention(envWith(d1.DB), NOW);
    expect(res.errors).toHaveLength(1);
    expect(res.errors[0]).toContain('otp purge');
    expect(res.errors[0]).toContain('otp boom');
    // The session compaction still executed.
    expect(d1.find('UPDATE sessions')).toBeTruthy();
  });

  it('never throws even if everything fails', async () => {
    const d1 = fakeD1();
    d1.failNextWith(new Error('D1 down'));
    await expect(runRetention(envWith(d1.DB), NOW)).resolves.toMatchObject({
      otpsPurged: 0,
      sessionsCompacted: 0,
    });
  });
});
