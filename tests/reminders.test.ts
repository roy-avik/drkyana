import { describe, it, expect } from 'vitest';
import { selectReminders, runReminders } from '../packages/server/src/scheduled/reminders';
import type { Env } from '../packages/server/src/bindings';
import { fakeD1 } from './helpers/d1';

// The reminder pass is the only proactive contact the practice makes. It must
// never throw (it runs unattended) and must never widen its own time window.
//
// NOTE: these pin the CURRENT intakes-based query. Phase 0.1/0.4 rewrites
// selectReminders to read `appointments` — these tests are the regression net
// for that change, and the table assertions are expected to be updated with it.

const DAY = 24 * 60 * 60;
const NOW = 1_700_000_000;

const row = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'i1',
  name: 'Rahim',
  phone: '01711',
  triage_level: 'RED',
  status: 'new',
  created_at: NOW - 100,
  ...over,
});

const envWith = (db: unknown, extra: Partial<Env> = {}) =>
  ({ DB: db, DR_KYANA_NOTIFY_EMAIL: 'dr@example.com', ...extra }) as unknown as Env;

describe('selectReminders', () => {
  it('binds the urgent window as a parameter, never interpolated', () => {
    const d1 = fakeD1([]);
    return selectReminders(envWith(d1.DB), NOW).then(() => {
      const q = d1.onlyQuery();
      expect(q.params).toEqual([NOW - 3 * DAY]);
      expect(q.sql).toContain('?');
      // A literal timestamp in the SQL would mean it was interpolated.
      expect(q.sql).not.toContain(String(NOW - 3 * DAY));
    });
  });

  it('honours the injected `now` rather than wall-clock time', async () => {
    const d1 = fakeD1([]);
    await selectReminders(envWith(d1.DB), 42);
    expect(d1.onlyQuery().params).toEqual([42 - 3 * DAY]);
  });

  it('caps the result set so a backlog cannot produce an unbounded email', async () => {
    const d1 = fakeD1([]);
    await selectReminders(envWith(d1.DB), NOW);
    expect(d1.onlyQuery().sql).toContain('LIMIT 50');
  });

  it('derives reason from status: scheduled -> followup, otherwise urgent', async () => {
    const d1 = fakeD1([row({ id: 'a', status: 'scheduled' }), row({ id: 'b', status: 'new' })]);
    const items = await selectReminders(envWith(d1.DB), NOW);
    expect(items.map((i) => [i.intakeId, i.reason])).toEqual([
      ['a', 'scheduled_followup'],
      ['b', 'urgent_uncontacted'],
    ]);
  });

  it('maps snake_case columns onto the domain shape', async () => {
    const d1 = fakeD1([row()]);
    const [item] = await selectReminders(envWith(d1.DB), NOW);
    expect(item).toEqual({
      intakeId: 'i1',
      name: 'Rahim',
      phone: '01711',
      triageLevel: 'RED',
      status: 'new',
      reason: 'urgent_uncontacted',
      createdAt: NOW - 100,
    });
  });

  it('tolerates null name/phone/triage without throwing', async () => {
    const d1 = fakeD1([row({ name: null, phone: null, triage_level: null })]);
    const [item] = await selectReminders(envWith(d1.DB), NOW);
    expect(item.name).toBeNull();
    expect(item.phone).toBeNull();
  });

  it('returns [] when D1 yields no results array', async () => {
    const d1 = fakeD1();
    d1.setRows(undefined as never);
    await expect(selectReminders(envWith(d1.DB), NOW)).resolves.toEqual([]);
  });
});

describe('runReminders — never throws', () => {
  it('reports a query failure instead of throwing', async () => {
    const d1 = fakeD1([]);
    d1.failNextWith(new Error('D1 exploded'));
    const res = await runReminders(envWith(d1.DB), NOW);
    expect(res).toEqual({ considered: 0, emailed: false, error: 'D1 exploded' });
  });

  it('sends nothing when there is nothing to remind about', async () => {
    const res = await runReminders(envWith(fakeD1([]).DB), NOW);
    expect(res).toEqual({ considered: 0, emailed: false });
  });

  it('reports a missing notify address rather than failing silently', async () => {
    const env = envWith(fakeD1([row()]).DB, { DR_KYANA_NOTIFY_EMAIL: undefined });
    const res = await runReminders(env, NOW);
    expect(res).toEqual({ considered: 1, emailed: false, error: 'no notify address' });
  });

  it('surfaces an email-binding failure as an error, not an exception', async () => {
    // No EMAIL binding configured -> sendEmail returns {ok:false}, never throws.
    const res = await runReminders(envWith(fakeD1([row()]).DB), NOW);
    expect(res.considered).toBe(1);
    expect(res.emailed).toBe(false);
    expect(res.error).toBeTruthy();
  });
});
