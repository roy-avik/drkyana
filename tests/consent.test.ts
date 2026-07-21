import { describe, it, expect } from 'vitest';
import {
  hasConsent,
  listConsents,
  withdrawConsent,
  consentTextHash,
  CONSENT_TEXTS,
} from '../packages/server/src/consent';
import { verifyOtp } from '../packages/server/src/lib/mail_otp';
import {
  CONSENT_POLICY_VERSION,
  CONSENT_SCOPES_AT_VERIFY,
} from '../packages/types/src/consent';
import type { Env } from '../packages/server/src/bindings';
import { fakeD1 } from './helpers/d1';

// PDPA 2026: consent must be recorded, provable, and withdrawable. These pin
// the three properties that make that true rather than aspirational.

const SALT = 'test-salt';
const EMAIL = 'patient@example.com';
const SESSION = 'sess-1';

const envWith = (db: unknown) => ({ DB: db, IP_HASH_SALT: SALT }) as unknown as Env;

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

describe('consent text hashing — provability', () => {
  it('hashes version + scope + canonical text, so an edit changes the hash', async () => {
    const expected = await sha256Hex(
      `${CONSENT_POLICY_VERSION}:ai_inference:${CONSENT_TEXTS.ai_inference}`,
    );
    expect(await consentTextHash('ai_inference')).toBe(expected);
  });

  it('gives every scope a distinct hash', async () => {
    const hashes = await Promise.all(
      (['care', 'ai_inference', 'email', 'mcp_third_party'] as const).map(consentTextHash),
    );
    expect(new Set(hashes).size).toBe(hashes.length);
  });

  it('names Anthropic explicitly in the inference notice', async () => {
    // The whole point of a separate ai_inference scope is that the patient is
    // told who processes their messages and that it leaves the country.
    expect(CONSENT_TEXTS.ai_inference).toContain('Anthropic');
    expect(CONSENT_TEXTS.ai_inference).toContain('outside Bangladesh');
  });

  it('names the cross-border transfer in the third-party notice', () => {
    expect(CONSENT_TEXTS.mcp_third_party).toContain('outside Bangladesh');
  });
});

describe('verifyOtp — consent is written atomically with verification', () => {
  async function pending(code: string) {
    return {
      id: 'otp-1',
      code_hash: await sha256Hex(`${code}:${SALT}`),
      expires_at: Math.floor(Date.now() / 1000) + 600,
      attempts: 0,
    };
  }

  it('records every at-verify scope in the SAME batch as the session upsert', async () => {
    // If these were separate writes, a partial failure could leave a verified
    // session with no consent record — exactly what PDPA does not allow.
    const d1 = fakeD1();
    d1.whenFirst('SELECT id, code_hash', await pending('123456'));

    await verifyOtp(envWith(d1.DB), {
      sessionId: SESSION,
      email: EMAIL,
      code: '123456',
      locale: 'bn',
    });

    expect(d1.batches).toHaveLength(1);
    const batch = d1.batches[0]!;
    const consentInserts = batch.filter((q) => q.sql.includes('INSERT INTO consents'));
    expect(consentInserts).toHaveLength(CONSENT_SCOPES_AT_VERIFY.length);
    // ...alongside, not instead of, the session upsert.
    expect(batch.some((q) => q.sql.includes('INSERT INTO sessions'))).toBe(true);
  });

  it('records the scopes, policy version and displayed locale', async () => {
    const d1 = fakeD1();
    d1.whenFirst('SELECT id, code_hash', await pending('123456'));
    await verifyOtp(envWith(d1.DB), {
      sessionId: SESSION,
      email: EMAIL,
      code: '123456',
      locale: 'bn',
      ipHash: 'iphash',
    });

    const inserts = d1.batches[0]!.filter((q) => q.sql.includes('INSERT INTO consents'));
    const scopes = inserts.map((q) => q.params[3]);
    expect(scopes).toEqual([...CONSENT_SCOPES_AT_VERIFY]);
    for (const q of inserts) {
      expect(q.params[4]).toBe(CONSENT_POLICY_VERSION);
      expect(q.params[6]).toBe('bn'); // locale actually displayed
      expect(q.params[7]).toBe('iphash');
    }
  });

  it('stores a hash of the text, never the text itself', async () => {
    const d1 = fakeD1();
    d1.whenFirst('SELECT id, code_hash', await pending('123456'));
    await verifyOtp(envWith(d1.DB), { sessionId: SESSION, email: EMAIL, code: '123456' });

    const insert = d1.batches[0]!.find((q) => q.sql.includes('INSERT INTO consents'))!;
    expect(insert.params[5]).toMatch(/^[0-9a-f]{64}$/);
    for (const p of insert.params) {
      expect(String(p)).not.toContain('I agree');
    }
  });

  it('writes NO consent when verification fails', async () => {
    const d1 = fakeD1();
    d1.whenFirst('SELECT id, code_hash', await pending('123456'));
    const res = await verifyOtp(envWith(d1.DB), {
      sessionId: SESSION,
      email: EMAIL,
      code: '000000',
    });
    expect(res.ok).toBe(false);
    expect(d1.batches).toHaveLength(0);
  });

  it('defaults the locale to en rather than writing null', async () => {
    const d1 = fakeD1();
    d1.whenFirst('SELECT id, code_hash', await pending('123456'));
    await verifyOtp(envWith(d1.DB), { sessionId: SESSION, email: EMAIL, code: '123456' });
    const insert = d1.batches[0]!.find((q) => q.sql.includes('INSERT INTO consents'))!;
    expect(insert.params[6]).toBe('en');
  });
});

describe('hasConsent — enforcement', () => {
  it('is true when the latest grant has no withdrawal', async () => {
    const d1 = fakeD1();
    d1.whenFirst('SELECT withdrawn_at', { withdrawn_at: null });
    expect(await hasConsent(envWith(d1.DB), EMAIL, 'ai_inference')).toBe(true);
  });

  it('is false once withdrawn', async () => {
    const d1 = fakeD1();
    d1.whenFirst('SELECT withdrawn_at', { withdrawn_at: 1_700_000_000 });
    expect(await hasConsent(envWith(d1.DB), EMAIL, 'ai_inference')).toBe(false);
  });

  it('is false when no consent was ever recorded', async () => {
    const d1 = fakeD1();
    d1.whenFirst('SELECT withdrawn_at', null);
    expect(await hasConsent(envWith(d1.DB), EMAIL, 'ai_inference')).toBe(false);
  });

  it('FAILS CLOSED on a query error — unknown state must not permit inference', async () => {
    const d1 = fakeD1();
    d1.failNextWith(new Error('D1 down'));
    await expect(hasConsent(envWith(d1.DB), EMAIL, 'ai_inference')).resolves.toBe(false);
  });

  it('reads the most recent grant only, and is parameterized', async () => {
    const d1 = fakeD1();
    d1.whenFirst('SELECT withdrawn_at', { withdrawn_at: null });
    await hasConsent(envWith(d1.DB), EMAIL, 'ai_inference');
    const q = d1.onlyQuery();
    expect(q.sql).toContain('ORDER BY granted_at DESC');
    expect(q.sql).toContain('LIMIT 1');
    expect(q.params).toEqual([EMAIL, 'ai_inference']);
    expect(q.sql).not.toContain(EMAIL);
  });
});

describe('withdrawConsent / listConsents', () => {
  it('only stamps a grant that is currently in force', async () => {
    const d1 = fakeD1();
    await withdrawConsent(envWith(d1.DB), EMAIL, 'ai_inference', 42);
    const q = d1.onlyQuery();
    expect(q.sql).toContain('withdrawn_at IS NULL');
    expect(q.params).toEqual([42, EMAIL, 'ai_inference']);
  });

  it('collapses history to the newest row per scope', async () => {
    // Newest-first from SQL; a re-grant after a withdrawal must read as granted.
    const d1 = fakeD1([
      { scope: 'ai_inference', policy_version: 'v2', granted_at: 200, withdrawn_at: null },
      { scope: 'ai_inference', policy_version: 'v1', granted_at: 100, withdrawn_at: 150 },
      { scope: 'care', policy_version: 'v1', granted_at: 100, withdrawn_at: null },
    ]);
    const out = await listConsents(envWith(d1.DB), EMAIL);
    expect(out).toEqual([
      { scope: 'ai_inference', granted: true, policyVersion: 'v2', grantedAt: 200, withdrawnAt: undefined },
      { scope: 'care', granted: true, policyVersion: 'v1', grantedAt: 100, withdrawnAt: undefined },
    ]);
  });

  it('reports a withdrawn scope as not granted', async () => {
    const d1 = fakeD1([
      { scope: 'email', policy_version: 'v1', granted_at: 100, withdrawn_at: 150 },
    ]);
    const [row] = await listConsents(envWith(d1.DB), EMAIL);
    expect(row.granted).toBe(false);
    expect(row.withdrawnAt).toBe(150);
  });
});
