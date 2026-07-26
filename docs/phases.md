# Roadmap phases — Dr Kyana platform

The durable, in-repo companion to the working plan
(`~/.claude/plans/do-a-thorough-research-inherited-crab.md`, out of repo). That
plan carries the full rationale and design detail; this file is the phase
ledger — what each phase is, and what has shipped. Update the **Status** and
**PR** columns as work lands.

**Phase 0 and Phase 1 are both complete and LIVE in prod.** Phase 0
(pre-launch, real PHI under Bangladesh's PDPA 2026) shipped as of the
`2026-07-25` policy version. The published legal pages carry full controller
identity (BMDC Reg. No. 15450), internal-architecture detail removed, "Privacy
Policy" naming, and "electronic health record" terminology — verified rendering
in EN/BN/FA at https://drkyana.com/privacy. Phase 1 (design language) finished
2026-07-27 — every item in its checklist below is shipped, deployed, and
verified live. **Current focus → Phase 2 (scheduling + calendar)**, not yet
started.

**Operational items outstanding (not code — for the operator, not the next
coding agent):**
- Email Service sending domain IS onboarded (Enabled/Configured). One
  confirmation still worth doing: click **Send** on a real draft once and check
  the result says `via binding` (not `smtp`) — that retires the long-standing
  `EmailMessage` API risk flag in CLAUDE.md. Not a blocker.
- Anthropic **BAA** before real (non-synthetic) PHI — procurement track.

**Non-blocking future code task:** 0.11a (widen the PII strip to withhold phone
from the model) — see below.

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

## Phase 1 — design language + component layer  ✅ COMPLETE (2026-07-27)

Started 2026-07-25, finished 2026-07-27. Full rationale: plan Part B. Landed
in small checkpointed PRs (#66–#90 — see git log for the full list), each
squash-merged and deployed (patient auto-deploys via Pages; admin needs a
manual `cd apps/admin && npm run deploy` — no Workers Build configured). Every
item below is shipped and verified live; nothing outstanding.

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
  - ✅ **Triage severity colors wired** (#75) — `red`/`orange`/`yellow`/
    `green` now resolve through the DLS tone mapping
    (`RED→danger`, `ORANGE→warning`, `YELLOW→info`, `GREEN→success`) in both
    `@theme` blocks. `YELLOW` renders DLS blue (the `info` tone), which read
    as confusing on a badge whose *text* still said "YELLOW" — fixed in the
    same PR by relabeling display text only (`TRIAGE_LABEL`/
    `TRIAGE_LABEL_SHORT` in `apps/admin/app/lib/format.ts`) to Emergency
    Severity Index terms (RED→"Level 2 · Emergency" … GREEN→"Level 5 ·
    Non-urgent"). The underlying `TriageLevel` enum/DB values are unchanged.
  - `design/calendar-mockup.html`'s four invented chamber colours are
    untouched — it's a static reference file, not live code; reconcile it
    when Phase 2 builds the real calendar.
- **Magenta decision (user-approved) — ✅ shipped (#66).** `accent-display`
  (`#ff4fd8`, decorative only) + `accent` (`#a8006e`, AA-passing) live in both
  `@theme` blocks. The `@keyframes neon-sign` + `.neon-heading` infinite
  flicker on the hero `<h1>` is deleted — replaced with a static
  `.hero-heading` using the same resting-state glow, no animation.
- **Component library: Base UI — ✅ COMPLETE (6/6 primitives).** Introduced
  `@base-ui/react` behind a shared workspace package (`packages/ui`,
  `@drkyana/ui`) implementing docs/dls.md's component rules exactly:
  - ✅ **Button** (+ compact `size="sm"`, #72–74, #80) and a `shape`
    ("flat"/"pill") variant (#84) so patient's expressive marketing/chat
    surfaces and admin's flat/utilitarian look share one implementation.
  - ✅ **Input** (#72–74) + the same `shape` variant (#84).
  - ✅ **Card** (#72–74) — dedupes the "3 incompatible Card defs" (patient's
    `rounded-2xl`/`ring-ink/5`, admin's `rounded-xl`/`border-ink/10`) onto
    one `radius-md` treatment.
  - ✅ **Chip** (#76–77) for the selectable-pill/filter pattern.
  - ✅ **Textarea** (#78).
  - ✅ **Select** (#88) — the compound one (Root/Trigger/Value/Icon/Portal/
    Positioner/Popup/List/Item), deferred longest since it's a real
    undertaking, not a thin wrapper. Migrated every raw `<select>` in the
    app, including one uncontrolled, `FormData`-backed usage in the agent's
    view-action pipeline (`ViewRenderer.tsx`) — verified safe by reading
    Base UI's source for how its hidden input participates in native form
    submission, then confirmed live in prod. Surfaced and fixed a real
    latent bug in the same pass (#89): a `type: "select"` field with numeric
    option values was never coerced from string, so the "Date range" intake
    filter had silently failed validation since before Select even existed.
  - ✅ **Admin rollout is exhaustive** — every `.card` and every
    `.btn-primary`/`.btn-ghost` usage in `apps/admin` is migrated (#81–82).
  - ✅ **Patient rollout** (#84) — patient now depends on `@drkyana/ui` for
    the first time (previously admin-only); the `@source not
    "../packages/ui/src"` Tailwind exclusion that kept its classes out of
    patient's bundle is dropped.
  - ✅ **`markdown.ts` dedup** (#70) — the byte-identical renderer in
    `src/lib/markdown.ts` / `apps/admin/app/lib/markdown.ts` is now
    `packages/types/src/markdown.ts`, one copy, 6 import sites updated.
  - ✅ **Error-banner `role="alert"`** (#68) — the copy-pasted
    `card border-red/30 bg-red/5 text-sm text-red` div (7 files) plus 4
    smaller variants all got `role="alert"` in place.
  - Patient JS bundle budget raised 150KB→300KB gzip (`scripts/
    check-bundle-size.mjs`) to accommodate Select's floating-ui footprint
    (patient gzip landed at ~170KB after #84/#88, comfortably under 300KB).
- **Admin console UX** (was the weakest surface — now addressed):
  - ✅ **`window.prompt`/`window.alert` replaced** (#67) —
    `AppointmentsPanel.tsx` (named "worst interaction in the product") now
    uses inline reschedule/cancel/no-show forms.
  - ✅ **Touch targets** (#67, #68, and every Base UI primitive above) —
    `min-h-11` (44px) on every button/input/chip/select, both the shared
    `.btn`/`.input` CSS classes and the `@drkyana/ui` primitives.
  - ✅ **Responsive breakpoints** (#83) — shell (`layout.tsx`/`Nav.tsx`)
    widens `max-w-3xl` → `max-w-3xl lg:max-w-5xl`; list views (intake queue,
    chambers, drafts, kb, research) become a 2-column grid at `lg:`; detail/
    chat/form surfaces get an explicit narrow cap so they don't stretch.
    Chose to keep the nav a horizontal tab bar rather than convert to a
    sidebar.
  - ✅ **`aria-current` + skip-link** (#68) — active nav tab exposes
    `aria-current="page"`; `layout.tsx` has a visually-hidden, focus-visible
    skip-link to `#main-content`.
  - ✅ **`aria-live` beyond error banners** (#90) — every action button
    whose label swaps during a pending request (Save/Ingest/Approve/Send/
    Refresh/Run) gets `aria-live="polite"`; `AppointmentsPanel`'s standalone
    "Loading…" paragraph gets `role="status"`.
  - **`<html lang="en")` — closed, not a bug.** Admin has zero i18n (it's a
    single-operator console); English is correctly the only language. Only
    revisit if admin ever gets localized.
- **Approach — ✅ audited as a system-wide pass (#86, #87).** The plan chose
  "Apple fundamentals, not Liquid Glass" — optical typography, 4pt grid,
  spring motion, 44px targets (done above), no translucency over clinical
  text. Audit findings and fixes:
  - **Spacing** — page-level layout was already clean (standard Tailwind,
    inherently 4px-based). Found narrow, genuine drift (redundant CSS
    overrides fighting `.btn-primary`/`.btn-ghost`'s own padding; a handful
    of isolated one-off values) and fixed those (#86) — but deliberately
    left alone several *consistent* micro-conventions that happened to sit
    off the formal 4px scale (chip/badge `py-0.5`, subtitle `mt-0.5`,
    chip-row `gap-1.5`, dense table-cell `py-1.5`) since normalizing an
    already-consistent pattern in isolation would have made the app less
    consistent, not more.
  - **Motion** — no motion system existed anywhere (stock Tailwind
    `ease-in-out`/`ease-out`/implicit default throughout). Added one shared
    `--ease-spring: cubic-bezier(0.22, 1, 0.36, 1)` token (both apps'
    `@theme` blocks) and applied it to every existing transition site in
    both apps + `@drkyana/ui` (#87) — no new library, no new interactions,
    durations unchanged.
  - **Typography** — DLS's 4-size scale (11/13/14.5/18px) was fine; the real
    bug was admin never loading the brand fonts at all (`globals.css`
    hardcoded generic `system-ui`, despite the DLS already defining the
    correct `font-sans` stack). Fixed (#85): admin now loads
    Poppins/Vazirmatn/Noto Sans Bengali via the same Google Fonts `<link>`
    patient uses, and `body`'s font-family is wired to
    `var(--dk-font-sans, ...)` — single-sourced from the DLS the same way
    PR #69 did for colors.
  - **Translucency** — audited, no clinical/patient data renders on a
    translucent surface; the one borderline case (`Contact.tsx`'s
    `bg-white/[0.06]` cards) is marketing contact copy, not clinical text,
    and was left as-is (not flagged as needing a fix).

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
