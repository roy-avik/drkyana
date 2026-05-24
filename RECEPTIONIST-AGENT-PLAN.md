# Plan: Anthropic-backed Clinical Receptionist Agent

**Status:** Not started. Approved direction as of 2026-05-24.
**Target:** Replace the on-device classifier path with a real clinical receptionist agent powered by Claude Haiku 4.5, hosted via the existing `drkyana-models` Cloudflare Worker. Keep the on-device classifier as the offline / API-down fallback. No Next.js, no Google OAuth, no Vite rewrite — extend the existing stack.

**Time estimate:** 1-1.5 focused days.
**Monthly cost estimate:** ~$5-15 at expected traffic (60 chats/day × ~10 turns).

---

## Why this exists

The on-device receptionist has been proven across multiple experiments to fail at the actual goal:

- **MiniLM classifier (current prod):** routes intent reliably but conversation is templated and rigid. No empathy, no follow-up, no multi-intent handling.
- **Gemma 3 270M (PR #22):** fits in the browser but cannot follow the system prompt — it self-describes ("I'm ready to be the friendly and efficient receptionist...") and hallucinates extra example pairs even after we moved few-shot exemplars into chat-template turns and tightened the output format. Documented in commits `f514529`, `5671bdd`, `0fb20f7` on `receptionist-gemma-270m-experimental`.
- **Gemma 4 E2B/E4B:** 3-5 GB browser download, hostile to Dr Kyana's mobile audience in Dhaka/Iran. Confirmed via HF file listings.

A real clinical receptionist needs frontier-model-level instruction following, safety tuning, and tool use. None of those are achievable on-device at sizes that fit in a browser tab. The infrastructure to host the model server-side (Worker, R2-backed proxy, CF Access, daily cron, structured logs) already exists and is in production — this plan reuses it.

---

## Architecture

```
[Vite SPA: Receptionist.tsx]
      ↓ POST /chat { sessionId, message }
      ↓ stream: Server-Sent Events (text/event-stream)
[CF Worker: drkyana-models]
      ├─ /chat              ← NEW. Anthropic proxy with tool use.
      ├─ /<path>            ← EXISTING. R2-backed model file CDN.
      └─ scheduled()        ← EXISTING. Daily R2 backfill cron.
            ↓
      Anthropic Messages API (claude-haiku-4-5-20251001)
            ↓
      Tool calls
            ├─ collect_intake_field   → write to D1 / log
            ├─ escalate_urgent        → email Dr Kyana + flag in D1
            ├─ suggest_chamber        → read chambers from Sheets-backed cache
            └─ submit_intake          → POST to existing Apps Script webhook
            ↓
      D1 (drkyana-receptionist)
            ├─ sessions(id, created_at, ip_hash, locale)
            ├─ messages(session_id, role, content, ts, input_tokens, output_tokens)
            └─ intake(session_id, field, value, ts)
```

**On-device classifier (MiniLM) remains as fallback** for: API outage, Worker error, region-blocked Anthropic access. The dispatcher pattern is already on the `receptionist-gemma-270m-experimental` branch in `Receptionist.tsx` — adapt it to dispatch between "agent path" and "classifier fallback path".

---

## Why Claude Haiku 4.5 (not Gemma or GPT-4o-mini)

Evaluated in session on 2026-05-24. Summary:

| Capability | Why critical here | Haiku 4.5 verdict |
|---|---|---|
| Refuse to invent prices/addresses/treatments | Liability for a medical practice | Best in tier |
| Recognize emergencies, defer diagnosis | Patient safety | Best in tier |
| Tool use reliability for structured intake | Trust what was actually collected | Best-in-class tool API |
| Hold a denylist over many turns | "Never name a price" must survive turn 8 | Strong |
| Bengali + Persian fluency | Dr Kyana's audience | Strong |
| Cost at 60 chats/day | Solo practitioner budget | ~$6-7/month |

Model ID for the Anthropic API: **`claude-haiku-4-5-20251001`**. Prompt caching should be enabled on the system prompt + tool definitions to drop input cost ~10×; at this traffic level it can bring monthly cost to ~$3.

---

## Implementation steps

Numbered in order. Each step has a clear acceptance check so a future agent can verify before moving on.

### 1. Add the `/chat` route to the Worker (~2 hours)

**Files touched:**
- `worker/src/index.ts` — add route handler
- `worker/wrangler.toml` — declare `ANTHROPIC_API_KEY` as a secret, bind D1, add KV namespace for rate limit counters

**Secret setup (one-time):**
```bash
cd worker
npx wrangler secret put ANTHROPIC_API_KEY
# paste the key when prompted
```

**Route handler shape:**
```typescript
// POST /chat
// Request:  { sessionId: string, message: string }
// Response: text/event-stream — proxies Anthropic's streaming response
//           after stripping tool_use blocks (handled server-side).

async function handleChat(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  // 1. Validate origin (CORS). Allow drkyana.com + *.drkyana.pages.dev.
  // 2. Read sessionId + message from JSON body.
  // 3. Per-IP rate check via KV (see step 4).
  // 4. Load conversation history from D1 by sessionId (last ~20 turns).
  // 5. Append the new user message; persist to D1.
  // 6. Call Anthropic with: system prompt + tool definitions + history + new message.
  // 7. Stream Anthropic response back to client as SSE.
  //    On tool_use: execute server-side, append tool_result, continue the loop.
  //    On text: stream text deltas straight through.
  // 8. After completion, persist the assistant turn (with token counts) to D1.
  // 9. Validation pass on emitted text before each chunk reaches client
  //    (regex denylist — see step 5).
}
```

**Acceptance check:**
- `curl https://drkyana-models.roy-ch-avik.workers.dev/chat -X POST -H 'Content-Type: application/json' -d '{"sessionId":"test","message":"hi"}'` streams a non-empty reply.
- Worker logs (Observability dashboard) show `event: chat_success` with token counts.

### 2. D1 schema + migrations (~1 hour)

**Create the D1 database:**
```bash
npx wrangler d1 create drkyana-receptionist
# Add the binding to worker/wrangler.toml:
#   [[d1_databases]]
#   binding = "DB"
#   database_name = "drkyana-receptionist"
#   database_id = "<id from create output>"
```

**Migration: `worker/migrations/0001_initial.sql`**
```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  ip_hash TEXT,
  locale TEXT,
  status TEXT NOT NULL DEFAULT 'active'  -- active | submitted | abandoned | escalated
);

CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,            -- user | assistant | tool
  content TEXT NOT NULL,
  ts INTEGER NOT NULL DEFAULT (unixepoch()),
  input_tokens INTEGER,
  output_tokens INTEGER,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);
CREATE INDEX idx_messages_session ON messages(session_id, ts);

CREATE TABLE intake (
  session_id TEXT NOT NULL,
  field TEXT NOT NULL,
  value TEXT NOT NULL,
  ts INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (session_id, field),
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE TABLE escalations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  ts INTEGER NOT NULL DEFAULT (unixepoch()),
  notified_at INTEGER,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);
```

Apply: `npx wrangler d1 execute drkyana-receptionist --file=migrations/0001_initial.sql`.

**Acceptance check:**
- `npx wrangler d1 execute drkyana-receptionist --command='SELECT name FROM sqlite_master WHERE type="table"'` lists all four tables.

### 3. Tool definitions + handlers (~2-3 hours)

The model gets a small, sharp tool surface. Each tool is server-side authoritative — the model can request, the Worker decides what actually happens.

**`worker/src/tools.ts`** — tool schemas in Anthropic format:

```typescript
export const TOOLS = [
  {
    name: 'collect_intake_field',
    description:
      'Record a piece of patient intake information that the patient has clearly stated. ' +
      'Use this for: full_name, phone, email, age_range, gender, affected_area, symptoms, ' +
      'duration, severity, triggers, conditions, allergies, medications, last_visit, ' +
      'anxiety, preferred_area, preferred_days, time_of_day, urgency, payment. ' +
      'Do not invent values — only call this with what the patient told you.',
    input_schema: {
      type: 'object',
      properties: {
        field: {
          type: 'string',
          enum: [
            'full_name', 'phone', 'email', 'age_range', 'gender',
            'affected_area', 'symptoms', 'duration', 'severity', 'triggers',
            'conditions', 'allergies', 'medications', 'last_visit', 'anxiety',
            'preferred_area', 'preferred_days', 'time_of_day', 'urgency', 'payment',
          ],
        },
        value: { type: 'string' },
      },
      required: ['field', 'value'],
    },
  },
  {
    name: 'escalate_urgent',
    description:
      'Flag this conversation as needing immediate attention from Dr Kyana. ' +
      'Call this when the patient describes: facial swelling with fever, uncontrolled ' +
      'bleeding, facial trauma, severe pain (8+/10), or any symptom you believe could ' +
      'be a dental emergency. After calling this, advise the patient to consider their ' +
      'nearest hospital while Dr Kyana is contacted.',
    input_schema: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'One sentence on why this is urgent.' },
      },
      required: ['reason'],
    },
  },
  {
    name: 'suggest_chamber',
    description:
      'Look up which of Dr Kyana\'s chambers is most convenient for the patient ' +
      'based on their preferred area of Dhaka. Returns the chamber name and ' +
      'general neighborhood. NEVER quote a specific address — defer to Dr Kyana.',
    input_schema: {
      type: 'object',
      properties: {
        area: { type: 'string', description: 'Area of Dhaka the patient mentioned.' },
        service: { type: 'string', description: 'Optional: service they want.' },
      },
      required: ['area'],
    },
  },
  {
    name: 'submit_intake',
    description:
      'Finalize the conversation and send the collected intake to Dr Kyana. ' +
      'Call this only after you have collected at minimum a phone number AND a ' +
      'description of why the patient is reaching out. After calling this, tell ' +
      'the patient Dr Kyana will reach out to them.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
] as const;
```

**`worker/src/toolHandlers.ts`** — server-side implementations:

```typescript
// collect_intake_field → write to D1 intake table (UPSERT on session_id+field)
// escalate_urgent      → write to D1 escalations + send email via existing Apps Script notifyUrgent
// suggest_chamber      → fetch chambers cache (sessionStorage on client) — server side, read from D1 cache or re-fetch Sheets
// submit_intake        → assemble payload from D1 intake rows, POST to VITE_SHEETS_WEBHOOK_URL (same as existing client-side flow)
```

Each handler returns a small JSON result that gets appended to the conversation as a `tool_result` message before the next Anthropic call.

**Acceptance check:**
- A test session with the message "I have severe tooth pain and swelling, my name is Sarah, phone +880 1234567" should produce, in D1:
  - `intake(session_id, 'full_name', 'Sarah')`
  - `intake(session_id, 'phone', '+880 1234567')`
  - `intake(session_id, 'symptoms', '...pain, swelling...')`
  - `escalations(session_id, reason, ...)`
- The patient-facing text should acknowledge urgency and advise considering nearest hospital.

### 4. Rate limiting + abuse protection (~1 hour)

**KV namespace for counters:**
```bash
npx wrangler kv:namespace create drkyana-rate
# Add binding to wrangler.toml
```

**Per-IP rate limit in `/chat` handler:**
- Hash IP with a Worker-side salt (don't store raw IP).
- Sliding window: max 20 messages/10min per IP, max 200/day per IP.
- Daily global token budget: e.g. 500k input + 500k output. If exceeded, return 503 with a "we're getting too much traffic — try again later" message. Reset at 00:00 UTC.

**Cloudflare Turnstile (optional, recommended):**
- Add Turnstile widget to the Vite SPA's standby screen.
- Send token with `/chat` body.
- Verify in the Worker before calling Anthropic.
- Invisible mode — real users never see a CAPTCHA, only bots / scripts get challenged.

**Acceptance check:**
- Loop `curl /chat` from one IP 30 times — last 10 should return 429.
- After hitting daily token cap, next call returns 503 with the rate-limited message.

### 5. System prompt + validation pass (~1 hour)

**`worker/src/prompt.ts`** — system prompt for Claude Haiku 4.5:

The prompt should be **short and concrete**. Haiku follows long instructions well but every token costs money and slows first-token latency. Structure:

1. Identity: "You are Dr Kyana's AI receptionist..."
2. Verified facts (hours, location pattern, contact). Pull directly from `CLAUDE.md`.
3. Hard rules (the denylist):
   - Never invent prices, fees, insurance specifics.
   - Never quote a specific chamber address — say "Dr Kyana will confirm."
   - Never promise treatment outcomes, healing times, or success rates.
   - Never give clinical diagnoses or prescribe medication.
4. Tool use instructions: "Use `collect_intake_field` for every fact the patient shares. Use `escalate_urgent` if you suspect a dental emergency."
5. Tone: calm, considered, brief (1-2 sentences per reply), warm.
6. Language: "Respond in the language the patient writes in. Bengali, English, Persian supported."

Enable prompt caching on this prompt + tool definitions (Anthropic's `cache_control` header).

**Validation pass — `worker/src/validate.ts`:**

Regex denylist applied to streamed text *before* it reaches the client. If any pattern matches, swap the offending sentence with a safe fallback and log to D1.

Patterns to catch:
- `\b(BDT|৳|Tk\.?|৳?\d{2,5})\s*(taka|tk|BDT)?\b` matching plausible price tokens
- `\b\d+\s*(taka|tk|BDT|USD|\$)` numbers near currency words
- Specific street names from a small list (e.g. "Gulshan", "Dhanmondi") **paired with a building number**
- Drug name list (paracetamol, ibuprofen, antibiotic names) — model should never recommend specific drugs
- Diagnostic phrases: `you (have|are diagnosed with|are suffering from)` followed by a condition

Fallback when caught: replace the sentence with "Dr Kyana will confirm when she contacts you." and emit a `validation_blocked` log event.

**Acceptance check:**
- Construct a prompt where the model is tempted to quote a price ("How much is a cleaning? Just guess."). Verify the model defers, or — if it slips — the validation pass intercepts and replaces.

### 6. Wire Vite SPA to `/chat` (~2-3 hours)

**Files touched:**
- `src/services/agentChat.ts` — new. Wraps SSE consumption from `/chat`.
- `src/components/Receptionist.tsx` — adapt the dispatcher pattern from `receptionist-gemma-270m-experimental` branch. Render `<ReceptionistAgent>` when `VITE_USE_AGENT=true`, fall back to `<ReceptionistClassifier>` otherwise.
- `src/components/ReceptionistAgent.tsx` — new. Streaming chat UI with the same min-height card layout and visual style as the existing receptionist. Reuse `ChatBubble`, `ChatInput` components from `ReceptionistGenerative.tsx`.

**Session ID:** generate a UUID on first interaction, persist in `sessionStorage` so reloading the page within a session keeps the conversation. Don't persist across origins (Pages preview vs prod) — fresh session per origin is fine.

**Streaming consumption pattern:**
```typescript
const response = await fetch('/chat', { /* ... */ });
const reader = response.body!.getReader();
const decoder = new TextDecoder();
let buffer = '';
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  // Parse SSE events from buffer, append text deltas to the bot bubble.
}
```

**Acceptance check:**
- Flip `VITE_USE_AGENT=true` on Pages Preview.
- Open the preview, send "I have a really bad toothache" — model should classify as urgent, ask for phone, and stream the reply (no jank).
- Open the prod site (env var unset) — classifier path still works, no regressions.

### 7. Locale updates (~30 min)

New copy needed for the agent-path-specific cases:
- `receptionist.agent.starting` — "Connecting to Dr Kyana's AI receptionist…"
- `receptionist.agent.error` — "We're having trouble reaching Dr Kyana's AI right now. Switching to standard chat."
- `receptionist.agent.rate_limited` — "We're getting too much traffic — please try again in a few minutes, or WhatsApp Dr Kyana directly."
- `receptionist.agent.escalated_message` — "I've flagged this as urgent. Please consider visiting your nearest hospital while Dr Kyana is contacted."

Add via `python scripts/locales.py add receptionist.agent.<key> --en "..." --fa "..." --bn "..."`. Update `CLAUDE.md` "How to update" section to mention the agent path.

### 8. Observability (~30 min)

Reuse the structured-log pattern already in the Worker. New events:
- `chat_request` — { sessionId, ipHash, locale, msg_len }
- `chat_response` — { sessionId, input_tokens, output_tokens, latency_ms, tool_calls: [...] }
- `chat_error` — { sessionId, error, anthropic_status }
- `tool_executed` — { sessionId, tool, params_hash, result_hash }
- `validation_blocked` — { sessionId, pattern, original_text_hash }
- `rate_limited` — { ipHash, reason }
- `escalation_emailed` — { sessionId, reason }

These flow into Workers Observability automatically (already enabled in `wrangler.toml`).

**Acceptance check:**
- After 10 test chats, the dashboard shows the event distribution. Cost per chat (input + output tokens × Haiku price) is visible.

---

## Acceptance criteria (whole feature)

A future agent can call this done when:

1. ✅ Patient at `https://drkyana.com` (with `VITE_USE_AGENT=true`) can send a message; reply streams in within 2s of first token.
2. ✅ Model identifies urgency, escalates correctly, asks for phone first when urgent.
3. ✅ Tool calls populate the D1 `intake` table with the right field/value pairs.
4. ✅ `submit_intake` POSTs to the existing Apps Script webhook with the same payload shape `logIntake` does today (so AppSheet on Dr Kyana's phone keeps working).
5. ✅ When `VITE_USE_AGENT` is unset, the classifier path is unchanged.
6. ✅ When Anthropic is unreachable or rate-limited, the patient sees a graceful fallback (offer to switch to the classifier path).
7. ✅ Validation pass intercepts at least one obvious hallucination attempt in a manual adversarial test.
8. ✅ Rate limiting denies the 31st request from one IP within 10 min.
9. ✅ A first-time-visitor end-to-end flow ("toothache → name → phone → submit") completes successfully and Dr Kyana receives the AppSheet notification.
10. ✅ Worker Observability dashboard shows chat events with token counts; cumulative daily cost is queryable.

---

## Out of scope (do NOT do)

- **Google OAuth / patient login.** Already evaluated 2026-05-24 — phone in intake is the identity mechanism, OAuth adds friction without solving any actual problem. CF Worker secrets are sufficient for API-key safety; OAuth is orthogonal.
- **Next.js rewrite.** Vite SPA + CF Worker is the same security model as Next.js + API routes for the keys-aren't-in-the-browser concern.
- **Replacing Apps Script / AppSheet.** Dr Kyana's existing mobile workflow lives there. D1 augments (conversation state, audit log) but does not replace.
- **Generative on-device fallback (Gemma).** Empirically failed. Classifier remains the offline fallback. Delete `receptionist-gemma-270m-experimental` branch if you're feeling tidy.
- **A patient dashboard, calendar, status tracker, etc.** Receptionist is intake only. Out-of-scope per `CLAUDE.md`.

---

## Open questions

Things to confirm with the user before starting, or surface in the first PR:

1. **Streaming chunking strategy.** Should the validation pass run per-chunk (low latency, harder to span sentences) or per-sentence (small UX delay)? **Recommended:** per-sentence buffering — feels more natural and gives the regex a complete sentence to evaluate.

2. **Conversation length cap.** How many turns before we force-submit or summarize? **Recommended:** 25 turns or 8000 tokens input, whichever first. After that, prompt the model to wrap up and submit.

3. **Session persistence across browser sessions.** Currently `sessionStorage`. Should we promote to `localStorage` so a patient can return tomorrow and resume? **Recommended:** No, for now. Each visit fresh — simpler privacy story, simpler D1 cleanup.

4. **D1 retention policy.** How long do we keep `messages` rows? **Recommended:** 90 days, then delete (cron in the same Worker).

5. **Cost cap behavior.** When the daily token budget is exceeded, do we (a) hard-503, (b) silently switch to classifier path, or (c) keep working but with a much shorter system prompt? **Recommended:** (b) — patient sees graceful continuity, classifier handles routing, no model bill grows.

6. **Anthropic prompt caching.** Add `cache_control: ephemeral` on system + tools? **Yes, do it.** Cuts input cost ~10× at this traffic level.

---

## Reference files in repo

- `worker/src/index.ts` — existing R2 proxy + cron. Add `/chat` route here.
- `worker/wrangler.toml` — existing R2 binding. Add D1 + KV + secret declarations.
- `src/services/intentClassifier.ts` — keep as fallback path.
- `src/services/intakeSchema.ts` — field IDs match the tool's `field` enum.
- `src/services/triage.ts` — review the rules; the model should match these heuristics.
- `src/services/receptionistLog.ts` — submission shape to Apps Script. Tool `submit_intake` should produce the same payload.
- `scripts/receptionist-webhook.gs` — Apps Script side; no changes expected.
- `CLAUDE.md` — project doc. Update "Architecture" section after this lands.

---

## Rollout

1. Build everything behind `VITE_USE_AGENT=false` (off) — no behavior change in prod.
2. Set `VITE_USE_AGENT=true` on Pages **Preview** only. Smoke test on the gemma-experimental URL or a fresh preview branch.
3. After 1 week of preview testing, flip `VITE_USE_AGENT=true` on Pages **Production**.
4. Monitor cost + escalation rate in the Worker Observability dashboard for 2 weeks.
5. Once stable, deprecate the `receptionist-gemma-270m-experimental` branch.

---

## Cost model (verify before flipping prod)

At 60 chats/day × ~10 turns × ~150 tokens each ≈ 90k tokens/day, split roughly 50/50 input/output, 30 days/month:

- Input: 1.35M tokens × $0.80/M = **$1.08**
- Output: 1.35M tokens × $4/M = **$5.40**
- With prompt caching on the system prompt (~600 tokens × 60 chats × 30 days = 1.08M cached input): saves ~$0.80
- **Estimated: $5-7/month before headroom for spikes.**

D1: free at this volume.
Worker requests: ~100k/month, free tier covers it.
KV reads/writes for rate limit: trivial, free tier.

---

## Done.

When a future session picks this up, start by re-reading `CLAUDE.md` for current architectural state, then this file for the plan, then check `git log --oneline main -10` to confirm nothing's drifted. Start with step 1 (the Worker `/chat` route) — every other step depends on having that endpoint.
