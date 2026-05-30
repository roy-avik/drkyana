# `.skills/` — clinical behaviour contracts

This directory holds the cross-cutting behaviour contracts that govern Dr Kyana's clinical agents (patient + admin) at runtime, plus one meta-skill (`sdlc`) for any coding agent working on this repo.

Each subdirectory is one skill, with a single `SKILL.md` file. The convention follows the [Vercel AI SDK agent-skills cookbook](https://ai-sdk.dev/cookbook/guides/agent-skills) — `name` and `description` are required frontmatter; `audience`, `owner`, `version`, and `preload` are local extensions we use for routing and governance.

## How skills reach the running agent

1. **Build time** — `scripts/bundle-skills.mjs` (runs via the `prebuild` and `pretypecheck` npm hooks) walks this directory, parses every `SKILL.md`'s frontmatter, and generates `packages/server/src/skills/_generated.ts`. The generated file inlines every skill body as a `Record<string, string>` plus a typed manifest.
2. **Agent construction** — in `packages/server/src/agents/{patient,admin}.ts`, the `SYSTEM` string is composed as `[CORE, ...preloadFor(audience), renderAvailableSkills(audience)].join('\n\n')`. Skills with `preload: true` are concatenated in full; the rest appear in an "Available skills:" list (name + description only).
3. **Runtime** — when the agent decides it needs a load-on-demand skill's body, it calls the `load_skill` tool with the skill's `name`. The audience filter is baked into the tool factory at construction time, so a patient session physically cannot load an admin-only skill body.

## Editing a skill

Just edit the `.md` file and rebuild:

```bash
# regenerates packages/server/src/skills/_generated.ts
npm run skills:bundle
```

Or simply run `npm run typecheck` — the `pretypecheck` hook bundles for you.

Schema is enforced at bundle time. The build fails on:

- Missing leading or trailing `---` frontmatter fence
- Missing `name` or `description`
- `name` not matching the directory name
- `audience` not in `patient | admin | both | coding-agent`
- `owner` not in `clinical | engineering`

## Catalog

| Skill | Audience | Owner | Preload | What it covers |
|---|---|---|---|---|
| `voice-and-tone` | both | clinical | ✓ | Brand voice baseline — calm, considered, modern, warm. Always-on. |
| `hard-rules` | both | clinical | ✓ | Never-diagnose, never-quote-price, never-give-street-address, no-autonomy. Always-on. |
| `consent-posture` | patient | clinical | ✓ | "Consent already accepted in UI; don't recite a privacy notice." Always-on. |
| `language-detection` | both | clinical | | EN/BN/FA detection nuances + Banglish handling + Dr Kyana's no-Bengali rule. Load on mixed-language input. |
| `triage` | patient | clinical | | RED/ORANGE/YELLOW/GREEN interpretation + the do-not-diagnose-while-acknowledging rule. Load after `run_triage`. |
| `intake-collection` | patient | clinical | | Form-first flow + the do-not-narrate-the-form rule. Load on first booking/urgent intent. |
| `returning-patient` | patient | clinical | | The "I have notes from your last visit" acknowledgement + the privacy moment. Load after `lookup_returning_patient` returns a match. |
| `chamber-suggestion` | patient | clinical | | Name + area only — never a street address. Load when preparing to wrap an intake with location preferences on file. |
| `urgent-escalation` | patient | clinical | | The hospital-now phrasing per language for RED outcomes. Load on RED triage or direct emergency description. |
| `sdlc` | coding-agent | engineering | | The contributor checklist for any coding agent (Claude Code, Cursor, etc.) opening this repo. Not loaded at runtime by the clinical agents. |

## Ownership and PR review

- **`owner: clinical`** — Dr Kyana (or the clinical reviewer) signs off on the PR. Engineering may file the PR; clinical must approve. Wire CODEOWNERS to enforce.
- **`owner: engineering`** — engineering signs off. Most coding-agent skills sit here.

## Adding a new skill

1. Create `.skills/<name>/` with a `SKILL.md` matching the frontmatter contract.
2. Decide audience and `preload`. Default to load-on-demand unless the skill is irreducible always-on.
3. `npm run skills:bundle` — the build fails fast on schema errors.
4. `npm run typecheck` — confirms the agent specs still compose cleanly.
5. Open a PR; route to the right owner.

## What does NOT belong here

- **Per-tool contracts.** Those live in the tool's `description` field — the model sees them exactly when considering that tool. Examples: how `draft_clinical_note` should structure its output, how `differential_diagnosis` stamps provenance.
- **Identity / scope statements.** Those stay in each agent's `CORE` constant in `agents/{patient,admin}.ts`. Skills cover behaviour; CORE covers identity.
- **Configuration values.** No model IDs, no thresholds in code constants. Use `packages/server/src/models.ts` and the relevant tool body.
