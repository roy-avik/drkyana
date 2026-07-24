# Roadmap phases — Dr Kyana platform

The durable, in-repo companion to the working plan
(`~/.claude/plans/do-a-thorough-research-inherited-crab.md`, out of repo). That
plan carries the full rationale and design detail; this file is the phase
ledger — what each phase is, and what has shipped. Update the **Status** and
**PR** columns as work lands.

**Current focus:** Phase 0 (pre-launch, real PHI under Bangladesh's PDPA 2026)
is **code-complete**. The published legal notice now carries full controller
identity (BMDC No.) with internal-architecture detail removed. The only
remaining Phase-0-adjacent item is the operational Email Service domain
onboarding (dashboard, not code) that flips patient email from the SMTP
fallback to the first-party binding. 0.11a (widen the PII strip) is a
non-blocking future task.

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

- **Disclosure-reduction — ✅ done (2026-07-23).** The privacy notice no longer
  names Cloudflare or GoDaddy (genericized to "third-party providers for
  hosting and email delivery, some outside Bangladesh" — the PDPA-required
  cross-border disclosure kept as a category). **Anthropic stays named** — the
  material, consent-relevant processor. Also removed the internal-mechanism
  wording (name-token placeholder, the SHA-256 fingerprint phrasing, the
  "salted, hashed" IP and "enterprise sign-in" details) in favour of standard
  privacy language, without weakening any required substance. The "what the AI
  processes" line stays **truthful**: today only the name is withheld from the
  model, so the notice does not claim contact details are withheld — it may
  only be narrowed *after* 0.11a lands.

- **BMDC registration number — ✅ done (2026-07-25).** Privacy §1 now names the
  **BMDC Registration No.** in all three locales. The number is a verifiable
  public-register identifier, so it satisfies PDPA controller-identifiability on
  its own — the practitioner's legal name is deliberately NOT printed (practice
  decision, privacy). This is the go-live version of the notice;
  `CONSENT_POLICY_VERSION` bumped to `2026-07-25`.

- **0.11a — widen the model-bound PII strip (⏳ future task).** Today
  `stripPatientName` (`packages/server/src/pii.ts`) withholds only the patient
  NAME from the model; phone/age/symptoms reach Anthropic, which is why the
  notice must currently say so. `submit_intake` already reads email + name from
  `ctx.caller` (server context), not from model args — do the same for
  **phone** so the number is client-held and never enters the model path. Age
  and symptoms MUST reach the model (triage needs them) and stay disclosed.
  Once phone is withheld, the disclosure can honestly narrow to "your name and
  contact details are withheld from the AI; the symptoms, age and history you
  describe do reach it." This is the `redactForModel` idea from Phase 3, pulled
  forward because it lets the disclosure shrink truthfully rather than by
  omission. **A future task master picks this up** — it is not a blocker for
  go-live (the current disclosure is already accurate).

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
