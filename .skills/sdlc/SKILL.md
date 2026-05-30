---
name: sdlc
description: Read before touching packages/server, apps/admin, migrations, src/components/Receptionist.tsx, or any .skills/* file. The canonical "how to safely change this codebase" checklist for any coding agent (Claude Code, Cursor, custom).
audience: coding-agent
owner: engineering
version: 1
preload: false
---

# Coding-agent SDLC

This is the single source of truth for "how to safely change this codebase." Audience: any LLM (Claude Code, Cursor, custom) opening this repo. Read top-to-bottom before your first edit.

## Before you change anything

- [ ] Read `CLAUDE.md` — it overrides defaults; covers brand voice, deferred features, the postcss advisory, the "don't reintroduce" list.
- [ ] Read the relevant `.skills/*/SKILL.md` for the behaviour you're touching. If a skill exists for it, the prompt is in the skill, not in `agents/*.ts`.
- [ ] Read `~/.claude/plans/1-why-not-both-binary-cray.md` for the current delta scope — your change should fit one of items 1–6 or be a clearly-scoped extension.
- [ ] If your change might overlap the "Already on main" table in that plan, **read the file before re-implementing**. Most things you'd build from scratch already exist.

## While changing

- [ ] Server-only code stays in `packages/server/`. Never import server modules into a client bundle. The isolation guard (`npm run check:isolation`) catches leaks — catch yourself first.
- [ ] New tool? Use `defineTool` with the correct `category` (`read | write | external`). Writes and external auto-require `needsApproval`. Authorise via `AgentContext` (`assertAdmin`, `assertOwnPatient`) — **never** trust model args.
- [ ] New behaviour rule? It belongs in a `.skills/<name>/SKILL.md`, not inline in `agents/*.ts`. If no fitting skill exists, create one with the right `audience` and `owner`. Re-run `npm run skills:bundle`.
- [ ] New translatable string? `python scripts/locales.py add` with all three locales — never edit `en.yaml` alone.
- [ ] New D1 column or table? Add `migrations/000N_*.sql`. Update `@drkyana/types`.
- [ ] Touching clinical reasoning output? Persist through `clinical_assists` with provenance stamps (item 4), not a free `draft_*`.
- [ ] Touching agent prompts? Prefer editing the skill; if you must edit `CORE`, leave a comment pointing at why it couldn't be a skill.

## Before commit

- [ ] `npm run typecheck` (runs `skills:bundle` via the `pretypecheck` hook).
- [ ] `npx tsc -p packages/server/tsconfig.json`
- [ ] `npm run check:isolation` (and `node scripts/check-isolation.mjs --dist` if you changed bundles).
- [ ] `npm run locales:check`
- [ ] `npm run images:optimize -- --check` (only if you touched `assets/`).
- [ ] `npm audit` — do **not** run `npm audit fix --force`; see CLAUDE.md's postcss advisory.
- [ ] If you touched a skill or prompt, run its eval if one exists under `packages/server/src/skills/__evals__/`.
- [ ] Conventional commit message; reference the plan item (e.g. `(plan item 1)`).

## Before ship

- [ ] Migrations applied to remote: `npm run db:migrate:remote`.
- [ ] Required secrets present in Cloudflare dashboard for the affected env (see Provisioning in `README.md`).
- [ ] The "agent drafts, dentist decides" guardrail still holds. No autonomous clinical action introduced anywhere in the change.

## Never

- Reintroduce Google Sheets, Apps Script, AppSheet, or on-device ML.
- Let the agent diagnose without `differential_diagnosis` (item 4) provenance stamps.
- Bypass `needsApproval` on `write` or `external` tools.
- Quote prices to patients or reveal chamber street addresses.
- Mutate `node_modules`.
- Commit `.env*`, `wrangler.toml` / `wrangler.jsonc` with real IDs, or any file containing real PHI.

## On uncertainty

- The plan at `~/.claude/plans/1-why-not-both-binary-cray.md` is the canonical priority list. If a task isn't on it, ask before doing it.
- The current delta is items 1–6 plus 7 (skills lift, mostly shipped) and 8 (this checklist). Anything else is a new plan.
- When in doubt about which skill body to consult for behaviour you're editing, `cat .skills/<name>/SKILL.md` — the skill's frontmatter `description` tells you whether it's the right one.
