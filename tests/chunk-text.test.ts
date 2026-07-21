import { describe, it, expect } from 'vitest';
import { chunkText } from '../packages/server/src/kb/ingest';

// chunkText feeds the KB embeddings. Silent breakage means kb_search starts
// returning garbage citations to a clinician — wrong, but plausible-looking.

const words = (n: number, w = 'word') => Array.from({ length: n }, () => w).join(' ');

describe('chunkText — trivial input', () => {
  it('returns no chunks for empty or whitespace-only text', () => {
    expect(chunkText('')).toEqual([]);
    expect(chunkText('   \n\n  ')).toEqual([]);
  });

  it('returns a single trimmed chunk when the text fits', () => {
    expect(chunkText('  short doc  ', 100)).toEqual(['short doc']);
  });

  it('normalises CRLF to LF', () => {
    expect(chunkText('a\r\nb', 100)).toEqual(['a\nb']);
  });
});

describe('chunkText — splitting', () => {
  it('splits text longer than the chunk size', () => {
    const chunks = chunkText(words(200), 100, 20);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('never emits an empty chunk', () => {
    for (const c of chunkText(words(500), 120, 30)) expect(c.trim()).not.toBe('');
  });

  it('covers the whole document — no content is dropped', () => {
    // Every source word must appear somewhere in the output.
    const source = Array.from({ length: 120 }, (_, i) => `w${i}`).join(' ');
    const joined = chunkText(source, 100, 20).join(' ');
    for (let i = 0; i < 120; i++) expect(joined).toContain(`w${i}`);
  });

  it('terminates rather than looping when overlap >= chunk size', () => {
    // start = max(end - overlap, start + 1) guarantees forward progress.
    const chunks = chunkText(words(100), 50, 999);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.length).toBeLessThan(1000);
  });
});

describe('chunkText — boundary preference', () => {
  it('prefers a paragraph break in the back half of the window', () => {
    const head = words(20); // ~100 chars
    const tail = words(40);
    const [first] = chunkText(`${head}\n\n${tail}`, 140, 10);
    expect(first).toBe(head);
  });

  it('falls back to a sentence break', () => {
    const first = 'This is the first sentence that runs on for a while. ';
    const rest = words(40);
    const [chunk] = chunkText(first + rest, 80, 10);
    expect(chunk).toBe(first.trim());
  });

  it('treats the Bengali danda as a sentence boundary', () => {
    // Most patients write Bengali, so the KB will hold Bengali source text.
    const first = 'এটি একটি বাক্য যা বেশ কিছুক্ষণ ধরে চলতে থাকে এবং শেষ হয়। ';
    const rest = 'পরবর্তী অংশ এখানে শুরু হয় এবং আরও কিছু লেখা আছে যা যথেষ্ট দীর্ঘ।';
    const [chunk] = chunkText(first + rest, 70, 10);
    expect(chunk).toBe(first.trim());
  });

  it('does not cut mid-word when a space boundary is available', () => {
    const chunks = chunkText(words(200, 'alpha'), 100, 20);
    for (const c of chunks) {
      expect(c.startsWith('alpha')).toBe(true);
      expect(c.endsWith('alpha')).toBe(true);
    }
  });

  it('still splits when no boundary exists in the back half', () => {
    // One unbroken token longer than the window — hard cut is the only option.
    const chunks = chunkText('x'.repeat(300), 100, 10);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join('').replace(/x/g, '').length).toBe(0);
  });
});
