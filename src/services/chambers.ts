// Fetch active chambers from the Apps Script GET endpoint.
// Cached in sessionStorage for the browser session.
// Graceful fallback: if fetch fails, returns empty array.

const WEBHOOK_URL = import.meta.env.VITE_SHEETS_WEBHOOK_URL as string | undefined;
const CACHE_KEY = 'drkyana:chambers';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export type Chamber = {
  name: string;
  area: string;
  days: string[];
  hours: string;
  capabilities: string[];
};

export async function fetchChambers(): Promise<Chamber[]> {
  if (!WEBHOOK_URL) return [];

  const cached = readCache();
  if (cached) return cached;

  try {
    const res = await fetch(WEBHOOK_URL, { method: 'GET' });
    if (!res.ok) return [];
    const data: Chamber[] = await res.json();
    writeCache(data);
    return data;
  } catch {
    return [];
  }
}

export type IntakeForSuggestion = {
  visitType?: string;
  preferredArea?: string;
  preferredDays?: string[];
};

export function suggestChamber(
  intake: IntakeForSuggestion,
  chambers: Chamber[],
): Chamber | null {
  if (chambers.length === 0) return null;

  const CAPABILITY_MAP: Record<string, string> = {
    scaling: 'scaling',
    rct: 'rct',
    checkup: 'general',
    consult: 'general',
    filling: 'general',
    other: 'general',
  };

  const scored = chambers.map((c) => {
    let score = 0;

    // Service match (hard filter)
    if (intake.visitType) {
      const needed = CAPABILITY_MAP[intake.visitType] ?? 'general';
      if (!c.capabilities.includes(needed)) return { chamber: c, score: -1 };
      score += 10;
    }

    // Area match
    if (intake.preferredArea && c.area) {
      const pArea = intake.preferredArea.toLowerCase();
      const cArea = c.area.toLowerCase();
      if (cArea.includes(pArea) || pArea.includes(cArea)) score += 5;
    }

    // Day match
    if (intake.preferredDays && intake.preferredDays.length > 0) {
      const cDays = new Set(c.days.map((d) => d.toLowerCase()));
      const overlap = intake.preferredDays.filter((d) => cDays.has(d.toLowerCase()));
      score += overlap.length;
    }

    return { chamber: c, score };
  });

  const valid = scored.filter((s) => s.score >= 0);
  if (valid.length === 0) return null;

  valid.sort((a, b) => b.score - a.score);
  return valid[0].chamber;
}

type CacheEntry = { data: Chamber[]; ts: number };

function readCache(): Chamber[] | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    if (Date.now() - entry.ts > CACHE_TTL) return null;
    return entry.data;
  } catch {
    return null;
  }
}

function writeCache(data: Chamber[]): void {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now() }));
  } catch {
    // quota exceeded — ignore
  }
}
