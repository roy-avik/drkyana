import { describe, it, expect } from 'vitest';
import {
  selectUpcomingAppointments,
  selectUrgentIntakes,
  selectReminders,
  runReminders,
} from '../packages/server/src/scheduled/reminders';
import type { Env } from '../packages/server/src/bindings';
import { fakeD1 } from './helpers/d1';

// The reminder pass is the only proactive contact the practice makes. Phase 0.4
// rewrote it to read the `appointments` table (the original only queried
// `intakes`, so it could never remind about a booked slot) while keeping the
// urgent-uncontacted-intake list as a safety net. It must never throw (it runs
// unattended) and must never widen its own windows.

const HOUR = 60 * 60;
const DAY = 24 * HOUR;
const NOW = 1_700_000_000;

const apptRow = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'a1',
  scheduled_at: NOW + HOUR,
  status: 'confirmed',
  patient_name: 'Rahim',
  patient_phone: '01711',
  chamber_name: 'Gulshan Chamber',
  chamber_area: 'Gulshan',
  ...over,
});

const urgentRow = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'i1',
  name: 'Karim',
  phone: '01822',
  triage_level: 'RED',
  created_at: NOW - 100,
  ...over,
});

const envWith = (db: unknown, extra: Partial<Env> = {}) =>
  ({ DB: db, DR_KYANA_NOTIFY_EMAIL: 'dr@example.com', ...extra }) as unknown as Env;

describe('selectUpcomingAppointments', () => {
  it('queries the appointments table, joined to patient and chamber', async () => {
    const d1 = fakeD1();
    d1.whenAll('FROM appointments', [apptRow()]);
    const items = await selectUpcomingAppointments(envWith(d1.DB), NOW);
    const q = d1.find('FROM appointments')!;
    expect(q.sql).toContain('JOIN patients');
    expect(q.sql).toContain('LEFT JOIN chambers');
    expect(items[0]).toEqual({
      kind: 'appointment',
      appointmentId: 'a1',
      scheduledAt: NOW + HOUR,
      status: 'confirmed',
      patientName: 'Rahim',
      patientPhone: '01711',
      chamberName: 'Gulshan Chamber',
      chamberArea: 'Gulshan',
    });
  });

  it('binds a forward 2-day window and only proposed/confirmed, parameterized', async () => {
    const d1 = fakeD1();
    d1.whenAll('FROM appointments', []);
    await selectUpcomingAppointments(envWith(d1.DB), NOW);
    const q = d1.find('FROM appointments')!;
    expect(q.sql).toContain("status IN ('proposed','confirmed')");
    // window = [now, now + 2 days); limit 50.
    expect(q.params).toEqual([NOW, NOW + 2 * DAY, 50]);
    expect(q.sql).not.toContain(String(NOW));
  });

  it('honours injected `now`', async () => {
    const d1 = fakeD1();
    d1.whenAll('FROM appointments', []);
    await selectUpcomingAppointments(envWith(d1.DB), 42);
    expect(d1.find('FROM appointments')!.params).toEqual([42, 42 + 2 * DAY, 50]);
  });

  it('tolerates a null chamber (LEFT JOIN) and null phone', async () => {
    const d1 = fakeD1();
    d1.whenAll('FROM appointments', [apptRow({ chamber_name: null, chamber_area: null, patient_phone: null })]);
    const [item] = await selectUpcomingAppointments(envWith(d1.DB), NOW);
    expect(item.chamberName).toBeNull();
    expect(item.patientPhone).toBeNull();
  });
});

describe('selectUrgentIntakes', () => {
  it('selects only RED/ORANGE new intakes within the 3-day lookback, RED first', async () => {
    const d1 = fakeD1();
    d1.whenAll('FROM intakes', [urgentRow()]);
    await selectUrgentIntakes(envWith(d1.DB), NOW);
    const q = d1.find('FROM intakes')!;
    expect(q.sql).toContain("status = 'new'");
    expect(q.sql).toContain("triage_level IN ('RED','ORANGE')");
    expect(q.sql).toContain('WHEN \'RED\' THEN 0');
    expect(q.params).toEqual([NOW - 3 * DAY, 50]);
  });

  it('maps columns onto the urgent-intake shape', async () => {
    const d1 = fakeD1();
    d1.whenAll('FROM intakes', [urgentRow()]);
    const [item] = await selectUrgentIntakes(envWith(d1.DB), NOW);
    expect(item).toEqual({
      kind: 'urgent_intake',
      intakeId: 'i1',
      name: 'Karim',
      phone: '01822',
      triageLevel: 'RED',
      createdAt: NOW - 100,
    });
  });
});

describe('selectReminders', () => {
  it('returns appointments first, then urgent intakes', async () => {
    const d1 = fakeD1();
    d1.whenAll('FROM appointments', [apptRow()]);
    d1.whenAll('FROM intakes', [urgentRow()]);
    const items = await selectReminders(envWith(d1.DB), NOW);
    expect(items.map((i) => i.kind)).toEqual(['appointment', 'urgent_intake']);
  });

  it('returns [] when both sources are empty', async () => {
    const d1 = fakeD1();
    d1.whenAll('FROM appointments', []);
    d1.whenAll('FROM intakes', []);
    await expect(selectReminders(envWith(d1.DB), NOW)).resolves.toEqual([]);
  });
});

describe('runReminders — never throws', () => {
  it('reports a query failure instead of throwing', async () => {
    const d1 = fakeD1();
    d1.failNextWith(new Error('D1 exploded'));
    const res = await runReminders(envWith(d1.DB), NOW);
    expect(res.emailed).toBe(false);
    expect(res.error).toBe('D1 exploded');
    expect(res.considered).toBe(0);
  });

  it('sends nothing when there is nothing to remind about', async () => {
    const d1 = fakeD1();
    d1.whenAll('FROM appointments', []);
    d1.whenAll('FROM intakes', []);
    const res = await runReminders(envWith(d1.DB), NOW);
    expect(res).toEqual({ considered: 0, appointments: 0, urgentIntakes: 0, emailed: false });
  });

  it('reports a missing notify address rather than failing silently', async () => {
    const d1 = fakeD1();
    d1.whenAll('FROM appointments', [apptRow()]);
    d1.whenAll('FROM intakes', []);
    const res = await runReminders(envWith(d1.DB, { DR_KYANA_NOTIFY_EMAIL: undefined }), NOW);
    expect(res).toEqual({ considered: 1, appointments: 1, urgentIntakes: 0, emailed: false, error: 'no notify address' });
  });

  it('counts each section and surfaces an email-binding failure as an error', async () => {
    // No EMAIL binding -> sendEmail returns {ok:false}, never throws.
    const d1 = fakeD1();
    d1.whenAll('FROM appointments', [apptRow(), apptRow({ id: 'a2' })]);
    d1.whenAll('FROM intakes', [urgentRow()]);
    const res = await runReminders(envWith(d1.DB), NOW);
    expect(res.considered).toBe(3);
    expect(res.appointments).toBe(2);
    expect(res.urgentIntakes).toBe(1);
    expect(res.emailed).toBe(false);
    expect(res.error).toBeTruthy();
  });
});
