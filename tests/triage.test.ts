import { describe, it, expect } from 'vitest';
import { assessTriage } from '../packages/server/src/tools/patient/run_triage';

// The triage rules are the one place in the platform where a wrong answer
// reaches a patient with no human in the loop — submit_intake computes stored
// triage with this exact function, and RED drives the urgent-escalation path.
// These tests pin the rules verbatim so a refactor can't quietly soften them.

describe('assessTriage — RED (hospital advice)', () => {
  it('swelling at severity 8 is RED', () => {
    expect(assessTriage({ symptoms: ['swelling'], severity: 8 })).toEqual({
      level: 'RED',
      action: 'fast_track',
      hospitalAdvice: true,
    });
  });

  it('bleeding at severity 9 is RED', () => {
    expect(assessTriage({ symptoms: ['bleeding'], severity: 9 }).level).toBe('RED');
  });

  it('swelling + bleeding is RED at ANY severity, including 0', () => {
    // No severity floor on this combination — deliberate.
    expect(assessTriage({ symptoms: ['swelling', 'bleeding'], severity: 0 }).level).toBe('RED');
    expect(assessTriage({ symptoms: ['swelling', 'bleeding'] }).level).toBe('RED');
  });

  it('only RED carries hospitalAdvice', () => {
    for (const c of [
      { symptoms: ['swelling'], severity: 7 },
      { symptoms: ['broken'], severity: 6 },
      { symptoms: ['loose'], severity: 1 },
      { severity: 0 },
    ]) {
      expect(assessTriage(c).hospitalAdvice).toBe(false);
    }
  });
});

describe('assessTriage — boundaries', () => {
  // Off-by-one here silently downgrades an emergency, so every threshold in the
  // rule set gets its just-below / just-at pair.
  it.each([
    // symptoms,             sev, expected
    [['swelling'], 7, 'ORANGE'],
    [['swelling'], 8, 'RED'],
    [['bleeding'], 8, 'ORANGE'],
    [['bleeding'], 9, 'RED'],
    [['swelling'], 4, 'YELLOW'],
    [['swelling'], 5, 'ORANGE'],
    [['broken'], 5, 'YELLOW'],
    [['broken'], 6, 'ORANGE'],
    [[], 7, 'YELLOW'],
    [[], 8, 'ORANGE'],
    [[], 4, 'GREEN'],
    [[], 5, 'YELLOW'],
  ])('symptoms=%j severity=%i -> %s', (symptoms, severity, expected) => {
    expect(assessTriage({ symptoms: symptoms as string[], severity: severity as number }).level).toBe(
      expected,
    );
  });
});

describe('assessTriage — YELLOW by symptom alone', () => {
  it.each(['swelling', 'broken', 'bleeding', 'loose'])(
    '%s with no severity is YELLOW, not GREEN',
    (symptom) => {
      expect(assessTriage({ symptoms: [symptom] }).level).toBe('YELLOW');
    },
  );

  it('"pain" alone is NOT a YELLOW trigger — only severity lifts it', () => {
    expect(assessTriage({ symptoms: ['pain'] }).level).toBe('GREEN');
    expect(assessTriage({ symptoms: ['pain'], severity: 5 }).level).toBe('YELLOW');
  });
});

describe('assessTriage — defaults and unknown input', () => {
  it('empty complaint is GREEN/normal', () => {
    expect(assessTriage({})).toEqual({ level: 'GREEN', action: 'normal', hospitalAdvice: false });
  });

  it('missing severity is treated as 0, not as unknown-and-therefore-urgent', () => {
    expect(assessTriage({ symptoms: [] }).level).toBe('GREEN');
  });

  it('unrecognised symptom ids do not escalate on their own', () => {
    expect(assessTriage({ symptoms: ['toothache', 'sensitivity', 'ulcer'] }).level).toBe('GREEN');
  });

  it('duplicate symptoms do not change the outcome', () => {
    expect(assessTriage({ symptoms: ['swelling', 'swelling'], severity: 5 }).level).toBe('ORANGE');
  });

  it('action follows level exactly', () => {
    expect(assessTriage({ symptoms: ['swelling', 'bleeding'] }).action).toBe('fast_track');
    expect(assessTriage({ severity: 8 }).action).toBe('priority');
    expect(assessTriage({ severity: 5 }).action).toBe('normal');
    expect(assessTriage({}).action).toBe('normal');
  });
});
