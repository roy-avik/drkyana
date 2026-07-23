# Roadmap phases — Dr Kyana platform

The durable, in-repo companion to the working plan
(`~/.claude/plans/do-a-thorough-research-inherited-crab.md`, out of repo). That
plan carries the full rationale and design detail; this file is the phase
ledger — what each phase is, and what has shipped. Update the **Status** and
**PR** columns as work lands.

**Current focus:** Phase 0 (pre-launch, real PHI under Bangladesh's PDPA 2026)
is code-complete; the two items below marked ⏳ are the only things between it
and a clean go-live.

## Phase 0 — launch blockers

| # | Item | Status | PR |
|---|---|---|---|
| 0.1/0.4/0.8 | Ops Worker on Cloudflare Workflows (reminders on appointments, retention) | ✅ shipped + deployed | #60, #61 |
| 0.2/0.3 | Email reaches patients (binding → SMTP-via-ops fallback); draft **Send** actually sends | ✅ shipped + deployed | #63 |
| 0.5 | Consent recorded at verification + enforced per turn (`ai_inference` fails closed) | ✅ shipped | #58 |
| 0.6 | Terms / Privacy / Support pages, EN/BN/FA, counsel-reviewed | ✅ shipped | #63 |
| 0.7 | WhatsApp number removed from the patient portal | ✅ shipped | #58 |
| 0.8 | PHI access log (`admin_actions.kind='read'`); `ADMIN_DEV_OPEN` dead in prod | ✅ shipped | #62 |
| 0.9 | Test floor (unit + the pure clinical logic) | ✅ shipped (155 tests) | #58… |
| 0.10 | Audit bug fixes (dead CSS tokens, migrations, nav) | ✅ shipped | #58 |
| — | CI patient bundle-size budget (150 KB gzip) | ✅ shipped | #63 |
| — | Migration-adoption safety + prod schema remediation | ✅ shipped | #59 |
| **0.11** | **BMDC registration number + tighten privacy-notice disclosure** (see below) | ⏳ **open** | — |

### 0.11 — controller identity + privacy-notice disclosure (the last blocker)

Two coupled edits to the published legal pages; both bump
`CONSENT_POLICY_VERSION`. Do them together in one version bump.

1. **BMDC registration number.** Privacy §1 currently says "a dental surgeon
   registered with the Bangladesh Medical & Dental Council". Counsel finding #5
   wants the **full registered name + BMDC registration number** for
   PDPA-grade controller identifiability. Blocked on the practice providing it.

2. **Reduce internal-architecture disclosure** (user request, 2026-07-23):
   - Stop naming **Cloudflare** and **GoDaddy**. The *cross-border transfer*
     disclosure is PDPA-required and stays, but as a category —
     "infrastructure providers for hosting and email delivery, outside
     Bangladesh". **Anthropic stays named** — the AI processing is the
     material, consent-relevant disclosure.
   - The "what reaches the AI" line stays **truthful**. Today only the name is
     withheld from the model, so the line correctly says other details reach
     Anthropic. It may only be narrowed *after* 0.11a below actually widens the
     redaction — never before.

   **0.11a (enabling code change) — widen the model-bound PII strip.** Today
   `stripPatientName` (`packages/server/src/pii.ts`) withholds only the patient
   NAME; phone/age/symptoms reach the model. `submit_intake` already reads
   email + name from `ctx.caller` (server context), not from model args — do
   the same for **phone** so the number is client-held and never enters the
   model path. Age and symptoms MUST reach the model (triage needs them) and
   stay disclosed. Once phone is withheld, the disclosure can honestly read
   "your name and contact details are withheld from the AI; the symptoms, age
   and history you describe do reach it." This is the `redactForModel` idea
   from Phase 3, pulled forward because it lets the disclosure shrink truthfully
   rather than by omission.

## Phase 1 — design language + component layer

DLS extension (three-tier tokens), Base UI component layer, admin console UX,
the magenta accent ramp. Blocks further UI work. **Not started.**

## Phase 2 — scheduling + calendar

Availability model (no double-booking), the DLS-native calendar, patient
book/reschedule/cancel writes. **Not started.**

## Phase 3 — patient site UX + patient MCP (read-only)

Focus/motion/a11y pass, `redactForModel` generalized (0.11a is the first slice),
`docs/data-protection.md`, patient MCP Stage 1. Stage 2 (writes) gated on the
Anthropic BAA. **Not started.**

## Phase 4 — clinical depth

Prescription writer (`draft_prescription` — settle the PDF design first),
ambient scribe, human-escalation tool. **Not started.**

## Phase 5 — admin-initiated WhatsApp escalation

Replaces the interim `care@drkyana.com` escalation route from 0.7, using
`DR_KYANA_WHATSAPP` as a Business-API sender (never her personal line). Last, by
design. **Not started.**
