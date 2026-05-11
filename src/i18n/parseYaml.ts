// Minimal YAML reader matching the project's intentionally-flat format:
// one `key: "value"` per line, JSON-style double-quoted strings, optional
// comments starting with `#`. Mirrors scripts/locales.py so the linter and
// runtime agree on what's parseable.
export function parseYaml(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  const lines = text.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim();
    const rest = line.slice(colon + 1).trim();
    if (!rest.startsWith('"')) continue;
    // Walk the string respecting escaped quotes.
    let value = '';
    let i = 1;
    while (i < rest.length) {
      const ch = rest[i];
      if (ch === '\\' && i + 1 < rest.length) {
        const next = rest[i + 1];
        value += next === 'n' ? '\n' : next === 't' ? '\t' : next;
        i += 2;
        continue;
      }
      if (ch === '"') break;
      value += ch;
      i += 1;
    }
    out[key] = value;
  }
  return out;
}
