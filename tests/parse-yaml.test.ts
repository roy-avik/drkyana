import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseYaml } from '../src/i18n/parseYaml';

// parseYaml drives every string a patient reads. It silently skips lines it
// can't parse, so a malformed entry shows the patient a raw dotted key instead
// of text — these tests pin what "parseable" means, matching scripts/locales.py.

const localePath = (l: string) =>
  fileURLToPath(new URL(`../public/locales/${l}.yaml`, import.meta.url));

describe('parseYaml — format', () => {
  it('parses simple key/value pairs', () => {
    expect(parseYaml('a.b: "hello"')).toEqual({ 'a.b': 'hello' });
  });

  it('ignores comments and blank lines', () => {
    expect(parseYaml('# a comment\n\na: "x"\n   \n')).toEqual({ a: 'x' });
  });

  it('tolerates leading and trailing whitespace', () => {
    expect(parseYaml('   a:   "x"   ')).toEqual({ a: 'x' });
  });

  it('keeps only the text up to the closing quote', () => {
    expect(parseYaml('a: "x" trailing junk')).toEqual({ a: 'x' });
  });

  it('allows colons inside the value', () => {
    expect(parseYaml('a: "9:00 - 17:00"')).toEqual({ a: '9:00 - 17:00' });
  });

  it('decodes \\n and \\t escapes', () => {
    expect(parseYaml('a: "one\\ntwo\\tthree"')).toEqual({ a: 'one\ntwo\tthree' });
  });

  it('decodes escaped quotes and backslashes', () => {
    expect(parseYaml('a: "say \\"hi\\""')).toEqual({ a: 'say "hi"' });
    expect(parseYaml('a: "back\\\\slash"')).toEqual({ a: 'back\\slash' });
  });

  it('handles an empty string value', () => {
    expect(parseYaml('a: ""')).toEqual({ a: '' });
  });

  it('later keys win on duplicates', () => {
    expect(parseYaml('a: "first"\na: "second"')).toEqual({ a: 'second' });
  });

  it('preserves non-Latin script verbatim', () => {
    expect(parseYaml('bn: "আমার রেকর্ড"\nfa: "سوابق من"')).toEqual({
      bn: 'আমার রেকর্ড',
      fa: 'سوابق من',
    });
  });
});

describe('parseYaml — silently skipped lines (documented failure mode)', () => {
  // These are exactly the cases that surface to a patient as a dotted key.
  it('skips a line with no colon', () => {
    expect(parseYaml('just some text')).toEqual({});
  });

  it('skips an unquoted value', () => {
    expect(parseYaml('a: unquoted')).toEqual({});
  });

  it('skips a single-quoted value', () => {
    expect(parseYaml("a: 'single'")).toEqual({});
  });

  it('does not throw on an unterminated quote', () => {
    expect(parseYaml('a: "no closing quote')).toEqual({ a: 'no closing quote' });
  });
});

describe('parseYaml — real locale files', () => {
  const locales = ['en', 'fa', 'bn'] as const;
  const parsed = Object.fromEntries(
    locales.map((l) => [l, parseYaml(readFileSync(localePath(l), 'utf8'))]),
  );

  it.each(locales)('%s parses to a non-empty dictionary', (l) => {
    expect(Object.keys(parsed[l]).length).toBeGreaterThan(100);
  });

  it('all three locales expose the same key set', () => {
    // scripts/locales.py check enforces this in CI; asserting it here means the
    // runtime parser and the linter agree on what counts as a key.
    const en = Object.keys(parsed.en).sort();
    expect(Object.keys(parsed.fa).sort()).toEqual(en);
    expect(Object.keys(parsed.bn).sort()).toEqual(en);
  });

  it.each(locales)('%s has no empty values', (l) => {
    const empty = Object.entries(parsed[l])
      .filter(([, v]) => v.trim() === '')
      .map(([k]) => k);
    expect(empty).toEqual([]);
  });
});
