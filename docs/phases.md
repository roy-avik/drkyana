# Roadmap phases — Dr Kyana platform

The durable, in-repo companion to the working plan
(`~/.claude/plans/do-a-thorough-research-inherited-crab.md`, out of repo). That
plan carries the full rationale and design detail; this file is the phase
ledger — what each phase is, and what has shipped. Update the **Status** and
**PR** columns as work lands.

**Current focus → Phase 1 (design language).** Phase 0 (pre-launch, real PHI
under Bangladesh's PDPA 2026) is **complete and LIVE in prod** as of the
`2026-07-25` policy version. The published legal pages carry full controller
identity (BMDC Reg. No. 15450), internal-architecture detail removed, "Privacy
Policy" naming, and "electronic health record" terminology — verified rendering
in EN/BN/FA at https://drkyana.com/privacy.

**Operational items outstanding (not code — for the operator, not the next
coding agent):**
- Email Service sending domain IS onboarded (Enabled/Configured). One
  confirmation still worth doing: click **Send** on a real draft once and check
  the result says `via binding` (not `smtp`) — that retires the long-standing
  `EmailMessage` API risk flag in CLAUDE.md. Not a blocker.
- Anthropic **BAA** before real (non-synthetic) PHI — procurement track.

**Non-blocking future code task:** 0.11a (widen the PII strip to withhold phone
from the model) — see below.

The next coding agent should start **Phase 1**. Full design detail is in the
plan (Part B); the actionable summary is in this file's Phase 1 section.

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
| 0.11 | Controller identity (BMDC No.) + reduced privacy disclosure + "Privacy Policy" / "electronic health record" renames | ✅ shipped + LIVE (v2026-07-25) | #65 |

**Phase 0 is done.** All items above shipped and deployed. The rest of this
section is reference for the next agent.

### 0.11 — controller identity + privacy disclosure (shipped in #65)

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

## Phase 1 — design language + component layer  ← START HERE

Blocks further UI work. **Not started.** Full rationale: plan Part B. Actionable
summary for the next agent:

- **One DLS, four surfaces.** `packages/types/src/dls.ts` already exists but is
  incomplete and consumed by only two surfaces. The repo currently has FOUR
  competing visual systems: patient `src/index.css` (`#ff4fd8` magenta accent),
  admin `apps/admin/app/globals.css` (`#3b82f6` blue, comment falsely claims it
  matches patient), the DLS (`#3b82f6`), and `design/calendar-mockup.html`
  (four invented chamber colours). Extend `dls.ts` to a three-tier token set
  (primitive → semantic → component) and make all four consume it: patient
  `@theme`, admin `@theme`, MCP `template.ts`, `ViewRenderer.tsx`.
- **Magenta decision (user-approved).** Keep magenta as the ONE accent
  everywhere; split into `accent-display` (`#ff4fd8`, decorative only — fails
  contrast, never functional) + `accent` (~`#A8006E`, AA-passing, for
  links/focus/active). **Delete the `@keyframes neon-sign` + `.neon-heading`**
  infinite flicker on the hero `<h1>` (`src/index.css`) — no
  `prefers-reduced-motion` anywhere in the repo yet. Semantic status colours
  must stay non-magenta.
- **Component library: Base UI** (v1.0, shadcn's default as of 2026, built-in
  RTL — matters for Farsi). Build primitives once, delete the duplicates: the
  audit found ~6 Input variants, ~8 Button variants, 3 incompatible Card defs,
  and an error-banner string copy-pasted in 7 admin files. `src/lib/markdown.ts`
  and `apps/admin/app/lib/markdown.ts` are byte-identical — a shared package
  waiting to happen. Watch the CI size budget (150 KB) — tree-shake, and
  code-split the patient routes (`React.lazy`) since there's none today.
- **Admin console UX** (weakest surface): `AppointmentsPanel.tsx` uses
  `window.prompt`/`window.alert` for rescheduling on a phone PWA (worst
  interaction in the product); ~20px touch targets; only 2 responsive
  breakpoints; no `aria-live`/`aria-current`/skip-link; `<html lang>` hardcoded.
- **Approach:** the plan chose "Apple fundamentals, not Liquid Glass" — optical
  typography, 4pt grid, spring motion, 44px targets, no translucency over
  clinical text.

Design tokens must never be hard-coded in a renderer (spec: `docs/dls.md`).

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
