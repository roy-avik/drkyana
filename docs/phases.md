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

**Phase 1 (design language) is IN PROGRESS**, started 2026-07-25: DLS tokens
(three-tier + runtime single-sourcing), the magenta accent decision, and a
handful of admin-UX fixes are shipped across PRs #66–#70. Base UI component
layer and responsive breakpoints are the two big pieces still open. Full
design detail is in the plan (Part B); current status is in this file's
Phase 1 section.

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

## Phase 1 — design language + component layer  ← IN PROGRESS

Blocks further UI work. Started 2026-07-25. Full rationale: plan Part B.
Landed in small checkpointed PRs (#66–#70), each squash-merged and deployed
(patient auto-deploys via Pages; admin needs a manual
`cd apps/admin && npm run deploy` — no Workers Build configured):

- **One DLS, four surfaces.**
  - ✅ **Tokens extended** (#66) — `packages/types/src/dls.ts` is now a real
    three-tier set: primitive (`DLS_PRIMITIVES`) → semantic (`DLS_TOKENS`) →
    component (`DLS_COMPONENT_TOKENS`, the data form of this doc's Component
    rules).
  - ✅ **Actually single-sourced at runtime** (#69) — patient `@theme` and
    admin `@theme` now read `var(--dk-token, fallback)`, and `applyDlsTokens()`
    (new export in `dls.ts`, same pattern the MCP template already used for
    host theming) sets the real `--dk-*` values from `DLS_TOKENS` on load
    (patient `main.tsx`; admin via a small client component,
    `ApplyDlsTokens.tsx`). Editing `dls.ts` now actually propagates —
    before #69 the two `@theme` blocks just happened to have matching
    hand-typed values.
  - ⏳ **Triage severity colors NOT wired.** `red`/`orange`/`yellow`/`green`
    are deliberately still literals in both `@theme` blocks. This doc's own
    tone mapping (`ORANGE→warning`, `YELLOW→info`) would change their
    rendered hex if wired — `info` is DLS blue, so `YELLOW` would silently
    render blue. That's a real visible change to the admin triage badges and
    needs its own decision, not a side effect of token plumbing.
  - `design/calendar-mockup.html`'s four invented chamber colours are
    untouched — it's a static reference file, not live code; reconcile it
    when Phase 2 builds the real calendar.
- **Magenta decision (user-approved) — ✅ shipped (#66).** `accent-display`
  (`#ff4fd8`, decorative only) + `accent` (`#a8006e`, AA-passing) live in both
  `@theme` blocks. The `@keyframes neon-sign` + `.neon-heading` infinite
  flicker on the hero `<h1>` is deleted — replaced with a static
  `.hero-heading` using the same resting-state glow, no animation.
- **Component library: Base UI — ⏳ not started.** Still open: introduce
  Base UI (v1.0), then dedupe the ~6 Input variants, ~8 Button variants, 3
  incompatible Card defs. Watch the CI size budget (150 KB) — tree-shake, and
  code-split the patient routes (`React.lazy`) since there's none today.
  - ✅ **`markdown.ts` dedup** (#70) — the byte-identical renderer in
    `src/lib/markdown.ts` / `apps/admin/app/lib/markdown.ts` is now
    `packages/types/src/markdown.ts`, one copy, 6 import sites updated.
  - ✅ **Error-banner `role="alert"`** (#68) — the copy-pasted
    `card border-red/30 bg-red/5 text-sm text-red` div (7 files) plus 4
    smaller variants all got `role="alert"` in place. The markup itself is
    still duplicated — that dedup (a shared component) is still Base UI work.
- **Admin console UX** (weakest surface):
  - ✅ **`window.prompt`/`window.alert` replaced** (#67) —
    `AppointmentsPanel.tsx` (named "worst interaction in the product") now
    uses inline reschedule/cancel/no-show forms.
  - ⏳ **Touch targets — partial** (#67, #68). `.btn`/`.input` (shared
    classes) and the admin nav tab bar are `min-h-11` (44px). One-off
    buttons/controls not using those shared classes weren't audited.
  - ⏳ **Responsive breakpoints — not started.** Still ~2 breakpoints total;
    needs real layout decisions (sidebar vs. top nav at desktop width, etc.),
    not a mechanical fix.
  - ✅ **`aria-current` + skip-link** (#68) — active nav tab exposes
    `aria-current="page"`; `layout.tsx` has a visually-hidden, focus-visible
    skip-link to `#main-content`.
  - ⏳ **`aria-live` beyond error banners — not started.** Loading/success/
    save-confirmation states don't announce.
  - **`<html lang="en")` — closed, not a bug.** Admin has zero i18n (it's a
    single-operator console); English is correctly the only language. Only
    revisit if admin ever gets localized.
- **Approach — not audited as a system-wide pass.** The plan chose "Apple
  fundamentals, not Liquid Glass" — optical typography, 4pt grid, spring
  motion, 44px targets, no translucency over clinical text. The 4px spacing
  scale exists in tokens (`space-1..6`) but isn't enforced/verified across
  components.

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
