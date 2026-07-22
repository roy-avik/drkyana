import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  filterActionDetail,
  recordAdminAction,
  listAdminActions,
} from '../packages/server/src/audit';
import { defineTool, toAiSdkTools } from '../packages/server/src/tools';
import type { AgentContext } from '../packages/server/src/context';
import type { Env } from '../packages/server/src/bindings';
import { fakeD1 } from './helpers/d1';

// The admin_actions log answers two compliance questions: WHO changed WHAT
// (kind='write', the cross-session feed) and WHO looked at WHICH patient's
// record (kind='read', the PHI-access audit — Phase 0.8). These pin the
// PHI-lean detail filtering, the kind discriminator, and the central executor
// hook that makes read-logging automatic for any tool marked phiRead.

const envWith = (db: unknown) => ({ DB: db }) as unknown as Env;

describe('filterActionDetail — PHI hygiene', () => {
  it('keeps short strings, numbers and booleans', () => {
    expect(filterActionDetail({ intakeId: 'i1', limit: 5, urgent: true })).toEqual({
      intakeId: 'i1',
      limit: 5,
      urgent: true,
    });
  });

  it('drops long strings — a document body must never enter the log', () => {
    const markdown = 'x'.repeat(500);
    expect(filterActionDetail({ draftId: 'd1', markdown })).toEqual({ draftId: 'd1' });
  });

  it('drops objects and arrays (schedules, facts, nested args)', () => {
    expect(
      filterActionDetail({ id: 'c1', schedule: [{ day: 'mon' }], facts: { allergies: ['x'] } }),
    ).toEqual({ id: 'c1' });
  });

  it('tolerates non-object input', () => {
    expect(filterActionDetail(undefined)).toEqual({});
    expect(filterActionDetail('nope')).toEqual({});
  });
});

describe('recordAdminAction — kind discriminator', () => {
  it("defaults to kind='write'", async () => {
    const d1 = fakeD1();
    await recordAdminAction(envWith(d1.DB), { actor: 'dr@x.com', surface: 'agent', tool: 'update_status' });
    const q = d1.find('INSERT INTO admin_actions')!;
    expect(q.sql).toContain('kind');
    expect(q.params[3]).toBe('write');
  });

  it("records kind='read' when asked — the PHI-access entry", async () => {
    const d1 = fakeD1();
    await recordAdminAction(envWith(d1.DB), {
      actor: 'dr@x.com',
      surface: 'mcp',
      tool: 'get_patient_memory',
      args: { patientId: 'p1' },
      kind: 'read',
    });
    const q = d1.find('INSERT INTO admin_actions')!;
    expect(q.params[3]).toBe('read');
    expect(JSON.parse(String(q.params[5]))).toEqual({ patientId: 'p1' });
  });

  it('never throws when the insert fails — logging must not break the action', async () => {
    const d1 = fakeD1();
    d1.failNextWith(new Error('no such column: kind'));
    await expect(
      recordAdminAction(envWith(d1.DB), { actor: 'a', surface: 'agent', tool: 't' }),
    ).resolves.toBeUndefined();
  });
});

describe('listAdminActions — kind filtering', () => {
  it("filters to kind='write' by default, so the activity feed stays about state changes", async () => {
    const d1 = fakeD1([]);
    await listAdminActions(envWith(d1.DB));
    const q = d1.find('FROM admin_actions')!;
    expect(q.sql).toContain('WHERE kind = ?');
    expect(q.params).toEqual(['write', 20]);
  });

  it("kind='read' selects the PHI-access audit", async () => {
    const d1 = fakeD1([]);
    await listAdminActions(envWith(d1.DB), 50, 'read');
    expect(d1.find('FROM admin_actions')!.params).toEqual(['read', 50]);
  });

  it('null kind returns everything, and the limit is clamped', async () => {
    const d1 = fakeD1([]);
    await listAdminActions(envWith(d1.DB), 9999, null);
    const q = d1.find('FROM admin_actions')!;
    expect(q.sql).not.toContain('WHERE');
    expect(q.params).toEqual([100]);
  });

  it("maps rows and defaults missing kind to 'write' (pre-0009 rows)", async () => {
    const d1 = fakeD1([
      { id: 'a1', actor: 'dr@x.com', surface: 'agent', tool: 'update_status', detail: '{"x":1}', at: 5 },
    ]);
    const [row] = await listAdminActions(envWith(d1.DB), 10, null);
    expect(row.kind).toBe('write');
    expect(row.detail).toEqual({ x: 1 });
  });
});

describe('toAiSdkTools — central audit hook', () => {
  function makeCtx(db: unknown, caller: AgentContext['caller']) {
    const pending: Promise<unknown>[] = [];
    const ctx = {
      env: envWith(db),
      caller,
      locale: 'en',
      waitUntil: (p: Promise<unknown>) => void pending.push(p),
    } as unknown as AgentContext;
    return { ctx, flush: () => Promise.all(pending) };
  }
  const admin = { kind: 'admin', email: 'dr@x.com', accessSub: 's' } as AgentContext['caller'];

  const run = async (spec: Parameters<typeof defineTool>[0], caller = admin, args: unknown = { id: 'r1' }) => {
    const d1 = fakeD1();
    const { ctx, flush } = makeCtx(d1.DB, caller);
    const tools = toAiSdkTools({ [spec.name]: defineTool(spec) }, ctx);
    const t = tools[spec.name] as unknown as { execute: (a: unknown) => Promise<unknown> };
    await t.execute(args);
    await flush();
    return d1;
  };

  it("a WRITE tool records kind='write'", async () => {
    const d1 = await run({
      name: 'update_status',
      description: 'd',
      category: 'write',
      inputSchema: z.object({}),
      execute: async () => ({ ok: true }),
    });
    const q = d1.find('INSERT INTO admin_actions')!;
    expect(q.params[3]).toBe('write');
    expect(q.params[4]).toBe('update_status');
  });

  it("a phiRead READ tool records kind='read'", async () => {
    const d1 = await run({
      name: 'get_patient_memory',
      description: 'd',
      category: 'read',
      phiRead: true,
      inputSchema: z.object({}),
      execute: async () => ({ summary: 's' }),
    });
    const q = d1.find('INSERT INTO admin_actions')!;
    expect(q.params[3]).toBe('read');
    expect(q.params[4]).toBe('get_patient_memory');
  });

  it('a plain READ tool records nothing — queue views stay unlogged', async () => {
    const d1 = await run({
      name: 'list_intakes',
      description: 'd',
      category: 'read',
      inputSchema: z.object({}),
      execute: async () => ({ items: [] }),
    });
    expect(d1.find('INSERT INTO admin_actions')).toBeUndefined();
  });

  it('a soft error ({ error }) records nothing — nothing happened', async () => {
    const d1 = await run({
      name: 'get_intake',
      description: 'd',
      category: 'read',
      phiRead: true,
      inputSchema: z.object({}),
      execute: async () => ({ error: 'not found' }),
    });
    expect(d1.find('INSERT INTO admin_actions')).toBeUndefined();
  });

  it('a patient caller records nothing — this audit is for admin access', async () => {
    const d1 = await run(
      {
        name: 'get_intake',
        description: 'd',
        category: 'read',
        phiRead: true,
        inputSchema: z.object({}),
        execute: async () => ({ ok: true }),
      },
      { kind: 'patient', sessionId: 'sess', ipHash: 'x' } as AgentContext['caller'],
    );
    expect(d1.find('INSERT INTO admin_actions')).toBeUndefined();
  });
});
