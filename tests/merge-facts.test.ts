import { describe, it, expect } from 'vitest';
import { mergeFacts } from '../packages/server/src/tools/admin/shared';

// mergeFacts is the mechanism behind the platform's core clinical-safety claim:
// structured facts (allergies, conditions, medications) are merged
// DETERMINISTICALLY and never invented by the model. If this ever started
// dropping or inventing entries, an allergy could silently vanish from a
// patient's record.

describe('mergeFacts', () => {
  it('unions existing and incoming facts', () => {
    expect(mergeFacts(['penicillin'], ['latex'])).toEqual(['penicillin', 'latex']);
  });

  it('preserves first-seen order', () => {
    expect(mergeFacts(['a', 'b'], ['c'], ['d'])).toEqual(['a', 'b', 'c', 'd']);
  });

  it('never drops an existing fact when incoming is empty or undefined', () => {
    expect(mergeFacts(['penicillin'], undefined)).toEqual(['penicillin']);
    expect(mergeFacts(['penicillin'], [])).toEqual(['penicillin']);
  });

  it('handles all-undefined input', () => {
    expect(mergeFacts(undefined, undefined)).toEqual([]);
    expect(mergeFacts()).toEqual([]);
  });

  it('dedupes exact repeats across and within lists', () => {
    expect(mergeFacts(['penicillin'], ['penicillin'])).toEqual(['penicillin']);
    expect(mergeFacts(['penicillin', 'penicillin'])).toEqual(['penicillin']);
  });

  it('trims surrounding whitespace and dedupes on the trimmed value', () => {
    expect(mergeFacts(['  penicillin  '], ['penicillin'])).toEqual(['penicillin']);
  });

  it('drops empty and whitespace-only entries', () => {
    expect(mergeFacts(['', '   ', 'latex'])).toEqual(['latex']);
  });

  it('drops "none" case-insensitively — a patient answering "None" must not become a fact', () => {
    expect(mergeFacts(['none', 'None', 'NONE', 'penicillin'])).toEqual(['penicillin']);
  });

  it('keeps "none" appearing inside a longer value', () => {
    // "none" is only meaningful as the whole answer.
    expect(mergeFacts(['nonextant condition'])).toEqual(['nonextant condition']);
  });

  it('does not mutate its inputs', () => {
    const existing = ['penicillin'];
    const incoming = ['latex'];
    mergeFacts(existing, incoming);
    expect(existing).toEqual(['penicillin']);
    expect(incoming).toEqual(['latex']);
  });

  // DOCUMENTED CURRENT BEHAVIOUR, not an endorsement: dedupe is case-SENSITIVE
  // even though the "none" filter is case-insensitive. "Penicillin" and
  // "penicillin" both survive as separate allergies. Changing this is a
  // deliberate data-quality decision, not a silent refactor — see the note in
  // the PR description.
  it('dedupe is case-sensitive (known inconsistency vs the "none" filter)', () => {
    expect(mergeFacts(['Penicillin'], ['penicillin'])).toEqual(['Penicillin', 'penicillin']);
  });
});
