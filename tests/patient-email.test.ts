import { describe, it, expect, beforeEach } from 'vitest';
import { buildRawEmail } from '../packages/server/src/email';
import { deliverPatientEmail } from '../packages/server/src/patient_email';
import { sendSmtpEmail } from '../packages/server/src/smtp';
import type { Env } from '../packages/server/src/bindings';
import { sent, setFailNextSend } from './stubs/worker-mailer';

// Patient-bound email is the practice's outward voice: a document that claims
// to be "sent" must actually have gone out, over a transport we can name.

const PDF_B64 = btoa('%PDF-1.4 fake'); // content is opaque; structure is what matters

describe('buildRawEmail — attachment MIME', () => {
  it('stays simple text/plain with no attachment', () => {
    const raw = buildRawEmail('care@drkyana.com', 'p@x.com', 'Hi', 'Body');
    expect(raw).toContain('Content-Type: text/plain; charset=UTF-8');
    expect(raw).not.toContain('multipart/mixed');
  });

  it('becomes multipart/mixed with a base64 PDF part when attached', () => {
    const raw = buildRawEmail('care@drkyana.com', 'p@x.com', 'Doc', 'See attached.', {
      filename: 'aftercare-123.pdf',
      contentBase64: PDF_B64,
      mimeType: 'application/pdf',
    });
    // One boundary, declared and terminated.
    const boundary = raw.match(/boundary="([^"]+)"/)?.[1];
    expect(boundary).toBeTruthy();
    expect(raw).toContain(`--${boundary}\r\n`);
    expect(raw.trimEnd().endsWith(`--${boundary}--`)).toBe(true);
    // The attachment part carries the right headers and the content.
    expect(raw).toContain('Content-Type: application/pdf; name="aftercare-123.pdf"');
    expect(raw).toContain('Content-Disposition: attachment; filename="aftercare-123.pdf"');
    expect(raw).toContain('Content-Transfer-Encoding: base64');
    expect(raw).toContain(PDF_B64);
    // The body text still precedes it.
    expect(raw.indexOf('See attached.')).toBeLessThan(raw.indexOf(PDF_B64));
  });

  it('folds long base64 into RFC-length lines', () => {
    const big = 'A'.repeat(400);
    const raw = buildRawEmail('care@drkyana.com', 'p@x.com', 'Doc', 'x', {
      filename: 'f.pdf',
      contentBase64: big,
      mimeType: 'application/pdf',
    });
    const longLines = raw.split('\r\n').filter((l) => l.length > 78);
    expect(longLines).toEqual([]);
  });
});

describe('sendSmtpEmail — attachment mapping', () => {
  beforeEach(() => {
    sent.length = 0;
    setFailNextSend(null);
  });

  const env = {
    SMTP_USER: 'care@drkyana.com',
    SMTP_PASSWORD: 'pw',
    RECEPTIONIST_FROM: 'care@drkyana.com',
  } as unknown as Env;

  it('passes the attachment through in worker-mailer shape (content = base64)', async () => {
    const res = await sendSmtpEmail(env, {
      to: 'p@x.com',
      subject: 'Doc',
      text: 'See attached',
      attachment: { filename: 'rx.pdf', contentBase64: PDF_B64, mimeType: 'application/pdf' },
    });
    expect(res).toEqual({ ok: true, to: 'p@x.com' });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.email.attachments).toEqual([
      { filename: 'rx.pdf', content: PDF_B64, mimeType: 'application/pdf' },
    ]);
  });

  it('sends no attachments key when there is none', async () => {
    await sendSmtpEmail(env, { to: 'p@x.com', subject: 's', text: 't' });
    expect(sent[0]!.email.attachments).toBeUndefined();
  });
});

describe('deliverPatientEmail — transport selection', () => {
  const baseArgs = { to: 'p@x.com', subject: 'Doc', body: 'hello' };

  /** Env with a working EMAIL binding (records raw messages). */
  function bindingEnv(extra: Partial<Env> = {}) {
    const sends: unknown[] = [];
    const env = {
      RECEPTIONIST_FROM: 'care@drkyana.com',
      EMAIL: { send: async (m: unknown) => void sends.push(m) },
      ...extra,
    } as unknown as Env;
    return { env, sends };
  }

  it('uses the binding when it works, and never touches OPS', async () => {
    let opsCalled = false;
    const { env } = bindingEnv({
      OPS: { sendPatientEmail: async () => ((opsCalled = true), { ok: true as const, to: 'p@x.com' }) },
    } as Partial<Env>);
    const res = await deliverPatientEmail(env, baseArgs);
    expect(res).toEqual({ ok: true, to: 'p@x.com', transport: 'binding' });
    expect(opsCalled).toBe(false);
  });

  it('falls back to SMTP-via-ops when the binding rejects (pre-onboarding reality)', async () => {
    const env = {
      RECEPTIONIST_FROM: 'care@drkyana.com',
      EMAIL: { send: async () => { throw new Error('destination address not verified'); } },
      OPS: { sendPatientEmail: async () => ({ ok: true as const, to: 'p@x.com' }) },
    } as unknown as Env;
    const res = await deliverPatientEmail(env, baseArgs);
    expect(res).toEqual({ ok: true, to: 'p@x.com', transport: 'smtp' });
  });

  it('reports BOTH transport errors when both fail — diagnosable from the UI', async () => {
    const env = {
      RECEPTIONIST_FROM: 'care@drkyana.com',
      EMAIL: { send: async () => { throw new Error('not verified'); } },
      OPS: { sendPatientEmail: async () => ({ ok: false as const, error: 'smtp auth failed' }) },
    } as unknown as Env;
    const res = await deliverPatientEmail(env, baseArgs);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toContain('not verified');
      expect(res.error).toContain('smtp auth failed');
    }
  });

  it('survives an OPS RPC throw', async () => {
    const env = {
      RECEPTIONIST_FROM: 'care@drkyana.com',
      EMAIL: { send: async () => { throw new Error('nope'); } },
      OPS: { sendPatientEmail: async () => { throw new Error('rpc dead'); } },
    } as unknown as Env;
    const res = await deliverPatientEmail(env, baseArgs);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('rpc dead');
  });

  it('says plainly when no fallback exists', async () => {
    const res = await deliverPatientEmail(
      { RECEPTIONIST_FROM: 'care@drkyana.com' } as unknown as Env,
      baseArgs,
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('no OPS service binding');
  });
});
