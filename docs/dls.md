# DLS — the Dr Kyana Design Language System

**Status:** v1 · **Tokens:** `packages/types/src/dls.ts` · **Consumers:** MCP App template (`packages/server/src/mcp/template.ts`), in-app view renderer (`apps/admin/app/components/ViewRenderer.tsx`)

The DLS is the shared visual language for every surface that renders drkyana
UI — the patient site, the admin PWA, and the **admin views rendered inside
agent hosts as MCP Apps**. It exists so a view drawn by Claude's iframe, the
admin assistant chat, and the admin pages all read as the same product:
calm, considered, modern.

## Principles

1. **Tokens, not styles.** Consumers never hard-code a color, size, or font.
   Everything visual resolves through a named token (`--dk-*` CSS custom
   property), defined once in `@drkyana/types` (`DLS_TOKENS`).
2. **Semantic tones.** Intent is expressed as one of six tones —
   `neutral · brand · info · success · warning · danger` — and every component
   (badge, button, callout, row accent, key-value emphasis) maps tones the
   same way. Clinical vocabulary maps onto tones deterministically: triage
   `RED→danger`, `ORANGE→warning`, `YELLOW→info`, `GREEN→success`;
   `sent`/`completed→success`; everything else `neutral`.
3. **Guest theming.** Inside an agent host, the MCP Apps host style variables
   (`McpUiStyles`) override the **neutral** tokens (surfaces, text, borders,
   radii, fonts) so views feel native to the host — light or dark. The
   **brand-owned** tokens (`brand` `#0f4c81`, `accent` `#3b82f6`, `on-brand`)
   never yield; they are the signature. `DLS_HOST_VARIABLE_MAP` is the
   explicit contract of what a host may re-skin.
4. **Calm hierarchy.** One text size step between levels, weight before size,
   muted before colored. Color is reserved for meaning (tones), never
   decoration.

## Tokens (v1)

### Color

| Token | Light | Dark | Host variable |
|---|---|---|---|
| `surface` | `#ffffff` | `#0b1220` | `--color-background-primary` |
| `surface-2` | `#f8fafc` | `#111a2c` | `--color-background-secondary` |
| `ink` | `#0f172a` | `#e2e8f0` | `--color-text-primary` |
| `muted` | `#475569` | `#94a3b8` | `--color-text-secondary` |
| `border` | `rgba(15,23,42,.12)` | `rgba(226,232,240,.14)` | `--color-border-primary` |
| `brand` | `#0f4c81` | `#0f4c81` | — (brand-owned) |
| `accent` | `#3b82f6` | `#60a5fa` | — (brand-owned) |
| `on-brand` | `#ffffff` | `#ffffff` | — (brand-owned) |
| `info` | `#3b82f6` | `#60a5fa` | `--color-text-info` |
| `success` | `#16a34a` | `#4ade80` | `--color-text-success` |
| `warning` | `#d97706` | `#fbbf24` | `--color-text-warning` |
| `danger` | `#dc2626` | `#f87171` | `--color-text-danger` |

### Typography

`font-sans` = Poppins (Latin) / Vazirmatn (fa) / Noto Sans Bengali (bn) with
system fallbacks; `font-mono` for editable markdown and code. Sizes:
`text-xs 11px · text-sm 13px · text-md 14.5px · text-lg 18px`; weights
`400 / 500 / 600`. Labels (table headers, key-value labels, form labels) are
`text-xs`, `weight-medium`, uppercase, letter-spaced, `muted`.

### Shape & space

Radii `sm 6px · md 10px · lg 14px · full` (chips). Border width `1px`;
`shadow-sm` only (cards). Spacing is a 4px scale: `space-1..6 = 4/8/12/16/24/32`.

## Component rules

- **Card** — `surface` + `border` + `radius-md` + `shadow-sm`; the only
  container. Sections, forms and tables live in cards.
- **Chip/badge** — `radius-full`, `text-xs`; `neutral` = filled `surface-2`,
  colored tones = outlined in the tone color, `brand` = filled brand.
- **Button** — `radius-sm`; default outlined; `brand`/`success`/`danger`
  tones are filled with `on-brand` text. Hover borrows `accent`.
- **Table** — header row per label style above; row hover `surface-2`;
  urgent rows get a 3px inset `danger` left rule (never a filled row).
- **Callout** — `surface-2` fill, tone-colored border + text. Used for
  guardrail reminders ("agent drafts, dentist decides") and errors.
- **Form** — labels per label style; inputs `surface` + `border` +
  `radius-sm`; focus ring is `accent`.

## Where it runs

The tokens materialize as `--dk-*` custom properties:

- **MCP App template** (`renderAdminViewTemplate`) inlines light + dark token
  blocks and, on `ui/initialize` / `host-context-changed`, applies host
  variables through `DLS_HOST_VARIABLE_MAP` — so the same document is
  host-native in Claude and brand-true when no host theme is offered.
- **Admin app** (`ViewRenderer`) expresses the same tokens through the
  existing Tailwind theme (`src/index.css` `@theme` shares these values).

Changing the language = changing `packages/types/src/dls.ts` (and this doc).
Never fork a color into a consumer.
