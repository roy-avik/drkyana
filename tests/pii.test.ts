import { describe, it, expect } from 'vitest';
import { stripPatientName } from '../packages/server/src/pii';
import { PATIENT_NAME_TOKEN } from '../packages/types/src/index';

// stripPatientName is the ONLY thing standing between a patient's real name and
// the model context / persisted chat log. A regression here is a PHI leak.

const intakePart = (output: Record<string, unknown>) => ({
  type: 'tool-collect_intake',
  output,
});

const msg = (parts: unknown[]) => ({ role: 'assistant', parts });

describe('stripPatientName', () => {
  it('replaces the name in a collect_intake result and returns the real value', () => {
    const res = stripPatientName([msg([intakePart({ name: 'Rahim Uddin', phone: '017...' })])]);
    expect(res.name).toBe('Rahim Uddin');
    const out = res.messages[0] as ReturnType<typeof msg>;
    expect((out.parts[0] as { output: { name: string } }).output.name).toBe(PATIENT_NAME_TOKEN);
  });

  it('leaves other fields on the tool output untouched', () => {
    const res = stripPatientName([
      msg([intakePart({ name: 'Rahim', phone: '01711', severity: 7 })]),
    ]);
    const output = (res.messages[0] as ReturnType<typeof msg>).parts[0] as {
      output: Record<string, unknown>;
    };
    expect(output.output.phone).toBe('01711');
    expect(output.output.severity).toBe(7);
  });

  it('does not mutate the input messages', () => {
    const input = [msg([intakePart({ name: 'Rahim' })])];
    stripPatientName(input);
    expect((input[0].parts[0] as { output: { name: string } }).output.name).toBe('Rahim');
  });

  it('last real name wins when the patient resubmits the form', () => {
    const res = stripPatientName([
      msg([intakePart({ name: 'Rahim' })]),
      msg([intakePart({ name: 'Rahim Uddin' })]),
    ]);
    expect(res.name).toBe('Rahim Uddin');
    for (const m of res.messages as ReturnType<typeof msg>[]) {
      expect((m.parts[0] as { output: { name: string } }).output.name).toBe(PATIENT_NAME_TOKEN);
    }
  });

  it('is idempotent — an already-tokenised message yields no name and no change', () => {
    const once = stripPatientName([msg([intakePart({ name: 'Rahim' })])]);
    const twice = stripPatientName(once.messages);
    expect(twice.name).toBeUndefined();
    expect(twice.messages).toEqual(once.messages);
  });

  it('ignores parts from other tools', () => {
    const res = stripPatientName([msg([{ type: 'tool-run_triage', output: { name: 'not-a-patient' } }])]);
    expect(res.name).toBeUndefined();
  });

  it('ignores a collect_intake CALL that has no output yet', () => {
    const res = stripPatientName([msg([{ type: 'tool-collect_intake', input: { reason: 'booking' } }])]);
    expect(res.name).toBeUndefined();
  });

  it('ignores a non-string name without throwing', () => {
    const res = stripPatientName([msg([intakePart({ name: 42 })])]);
    expect(res.name).toBeUndefined();
  });

  it('survives malformed messages (no parts, null, non-array)', () => {
    const input = [{ role: 'user' }, null, { role: 'user', parts: 'nope' }];
    expect(() => stripPatientName(input as unknown[])).not.toThrow();
    expect(stripPatientName(input as unknown[]).name).toBeUndefined();
  });

  it('handles an empty conversation', () => {
    expect(stripPatientName([])).toEqual({ messages: [], name: undefined });
  });
});
