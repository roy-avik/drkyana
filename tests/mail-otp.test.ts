import { describe, it, expect } from 'vitest';
import { verifyOtp } from '../packages/server/src/lib/mail_otp';
import type { Env } from '../packages/server/src/bindings';
import { fakeD1 } from './helpers/d1';

// OTP verification is what gates every subsequent patient request — the signed
// session cookie is only issued once this returns ok. These tests pin the
// properties that make it safe to expose publicly.

const SALT = 'test-salt';
const SESSION = 'sess-1';
const EMAIL = 'patient@example.com';
const NOW = () => Math.floor(Date.now() / 1000);

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const envWith = (db: unknown) => ({ DB: db, IP_HASH_SALT: SALT }) as unknown as Env;

/** A pending OTP row for `code`, valid unless overridden. */
async function pending(code: string, over: Record<string, unknown> = {}) {
  return {
    id: 'otp-1',
    code_hash: await sha256Hex(`${code}:${SALT}`),
    expires_at: NOW() + 600,
    attempts: 0,
    ...over,
  };
}

describe('verifyOtp — happy path', () => {
  it('accepts the correct code and returns the normalised email', async () => {
    const d1 = fakeD1();
    d1.whenFirst('SELECT id, code_hash', await pending('123456'));
    const res = await verifyOtp(envWith(d1.DB), {
      sessionId: SESSION,
      email: EMAIL,
      code: '123456',
    });
    expect(res).toEqual({ ok: true, verifiedEmail: EMAIL });
  });

  it('normalises the email — case and whitespace must not create a second identity', async () => {
    const d1 = fakeD1();
    d1.whenFirst('SELECT id, code_hash', await pending('123456'));
    const res = await verifyOtp(envWith(d1.DB), {
      sessionId: SESSION,
      email: '  PATIENT@Example.COM  ',
      code: '123456',
    });
    expect(res).toEqual({ ok: true, verifiedEmail: EMAIL });
  });

  it('tolerates surrounding whitespace in the submitted code', async () => {
    const d1 = fakeD1();
    d1.whenFirst('SELECT id, code_hash', await pending('123456'));
    const res = await verifyOtp(envWith(d1.DB), {
      sessionId: SESSION,
      email: EMAIL,
      code: ' 123456 ',
    });
    expect(res.ok).toBe(true);
  });

  it('marks the OTP consumed and stamps the session in ONE batch', async () => {
    // Atomicity matters: a verified session must never exist without its OTP
    // being burnt, or the code could be replayed.
    const d1 = fakeD1();
    d1.whenFirst('SELECT id, code_hash', await pending('123456'));
    await verifyOtp(envWith(d1.DB), { sessionId: SESSION, email: EMAIL, code: '123456' });

    expect(d1.batches).toHaveLength(1);
    const sqls = d1.batches[0]!.map((q) => q.sql);
    expect(sqls.some((s) => s.includes('consumed_at'))).toBe(true);
    expect(sqls.some((s) => s.includes('INSERT INTO sessions'))).toBe(true);
  });

  it('upserts the session rather than assuming the row exists', async () => {
    // Verification happens before the patient sends any message, so the session
    // row may not exist yet — a bare UPDATE would silently no-op.
    const d1 = fakeD1();
    d1.whenFirst('SELECT id, code_hash', await pending('123456'));
    await verifyOtp(envWith(d1.DB), { sessionId: SESSION, email: EMAIL, code: '123456' });
    expect(d1.find('INSERT INTO sessions')?.sql).toContain('ON CONFLICT(id) DO UPDATE');
  });
});

describe('verifyOtp — rejection paths', () => {
  it('rejects when there is no pending code', async () => {
    const d1 = fakeD1();
    d1.whenFirst('SELECT id, code_hash', null);
    const res = await verifyOtp(envWith(d1.DB), { sessionId: SESSION, email: EMAIL, code: '123456' });
    expect(res).toEqual({ ok: false, error: 'no_pending_code' });
  });

  it('rejects an expired code', async () => {
    const d1 = fakeD1();
    d1.whenFirst('SELECT id, code_hash', await pending('123456', { expires_at: NOW() - 1 }));
    const res = await verifyOtp(envWith(d1.DB), { sessionId: SESSION, email: EMAIL, code: '123456' });
    expect(res).toEqual({ ok: false, error: 'expired' });
  });

  it('rejects once the attempt ceiling is reached, without comparing the code', async () => {
    const d1 = fakeD1();
    d1.whenFirst('SELECT id, code_hash', await pending('123456', { attempts: 5 }));
    const res = await verifyOtp(envWith(d1.DB), { sessionId: SESSION, email: EMAIL, code: '123456' });
    expect(res).toEqual({ ok: false, error: 'too_many_attempts' });
    // Locked out means locked out — no session may be stamped.
    expect(d1.batches).toHaveLength(0);
  });

  it('rejects a wrong code', async () => {
    const d1 = fakeD1();
    d1.whenFirst('SELECT id, code_hash', await pending('123456'));
    const res = await verifyOtp(envWith(d1.DB), { sessionId: SESSION, email: EMAIL, code: '000000' });
    expect(res).toEqual({ ok: false, error: 'invalid_code' });
    expect(d1.batches).toHaveLength(0);
  });

  it('increments attempts BEFORE comparing, so guesses are always counted', async () => {
    const d1 = fakeD1();
    d1.whenFirst('SELECT id, code_hash', await pending('123456'));
    await verifyOtp(envWith(d1.DB), { sessionId: SESSION, email: EMAIL, code: '000000' });
    expect(d1.find('attempts = attempts + 1')).toBeTruthy();
  });
});

describe('verifyOtp — secrets and scoping', () => {
  it('never puts the raw code in any SQL parameter', async () => {
    const d1 = fakeD1();
    d1.whenFirst('SELECT id, code_hash', await pending('123456'));
    await verifyOtp(envWith(d1.DB), { sessionId: SESSION, email: EMAIL, code: '123456' });
    for (const p of d1.allParams()) expect(String(p)).not.toBe('123456');
  });

  it('scopes the lookup to the session, so a code cannot be replayed elsewhere', async () => {
    const d1 = fakeD1();
    d1.whenFirst('SELECT id, code_hash', await pending('123456'));
    await verifyOtp(envWith(d1.DB), { sessionId: SESSION, email: EMAIL, code: '123456' });
    const lookup = d1.find('SELECT id, code_hash')!;
    expect(lookup.sql).toContain('session_id = ?');
    expect(lookup.sql).toContain('consumed_at IS NULL');
    expect(lookup.params).toEqual([EMAIL, SESSION]);
  });

  it('is salt-sensitive — a code hashed under a different salt does not verify', async () => {
    const d1 = fakeD1();
    d1.whenFirst('SELECT id, code_hash', {
      id: 'otp-1',
      code_hash: await sha256Hex('123456:some-other-salt'),
      expires_at: NOW() + 600,
      attempts: 0,
    });
    const res = await verifyOtp(envWith(d1.DB), { sessionId: SESSION, email: EMAIL, code: '123456' });
    expect(res).toEqual({ ok: false, error: 'invalid_code' });
  });

  it('parameterizes every query it issues', async () => {
    const d1 = fakeD1();
    d1.whenFirst('SELECT id, code_hash', await pending('123456'));
    await verifyOtp(envWith(d1.DB), { sessionId: SESSION, email: EMAIL, code: '123456' });
    for (const q of [...d1.queries, ...d1.batches.flat()]) {
      expect(q.sql).not.toContain(EMAIL);
      expect(q.sql).not.toContain(SESSION);
    }
  });
});
