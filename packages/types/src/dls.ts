/**
 * DLS — the Dr Kyana Design Language System.
 *
 * Single source of truth for the visual language every drkyana surface speaks:
 * the patient site, the admin PWA, and the MCP App views rendered inside agent
 * hosts. Tokens are plain data (client-safe) — each consumer materializes them
 * as CSS custom properties (`--dk-*`).
 *
 * Three tiers, primitive → semantic → component (spec: docs/dls.md):
 *  1. `DLS_PRIMITIVES` — the raw color ramp. No meaning attached; nothing
 *     consumes these directly except tier 2.
 *  2. `DLS_TOKENS` (`DlsColorToken` + typography/shape/space) — semantic
 *     names consumers actually style with (`--dk-accent`, `--dk-danger`, …),
 *     each resolving to a primitive.
 *  3. `DLS_COMPONENT_TOKENS` — named aliases for the component rules in
 *     docs/dls.md (card, chip, button, table, callout, form), each resolving
 *     to a semantic token. Formalizes what was previously prose-only so a
 *     shared component layer (Base UI) can consume it as data.
 *
 * Brand voice: calm, considered, modern.
 *
 * Host adaptation: inside an MCP App the host's style variables (MCP Apps
 * `McpUiStyles`, e.g. `--color-background-primary`) OVERRIDE the neutral
 * tokens so views feel native to Claude/other hosts, while brand-owned tokens
 * (brand, accent, accent-display) never yield. `DLS_HOST_VARIABLE_MAP`
 * declares which host variable feeds which token.
 */

// ---------------------------------------------------------------------------
// Tier 1 — primitives (raw palette, no semantic meaning)
// ---------------------------------------------------------------------------

/**
 * The magenta ramp splits by function, not just shade:
 *  - `magenta-500` (#ff4fd8) is the "Tokyo nightlife" display magenta the
 *    brand was built around. It fails AA contrast on white and is never used
 *    for interactive/functional UI — decorative only (hero display text).
 *  - `magenta-700` (#a8006e) is the AA-passing (4.5:1+ on white) working
 *    shade used everywhere the accent must actually be legible: links,
 *    focus rings, active states, buttons.
 */
export const DLS_PRIMITIVES = {
  white: "#ffffff",
  "slate-50": "#f8fafc",
  "slate-900": "#0f172a",
  "slate-600": "#475569",
  "slate-400": "#94a3b8",
  "slate-200": "rgba(15, 23, 42, 0.12)",
  "slate-200-dark": "rgba(226, 232, 240, 0.14)",
  "navy-900": "#0f172a",
  "navy-800": "#0b1220",
  "navy-700": "#111a2c",

  "brand-700": "#0f4c81", // Dr Kyana brand navy
  "brand-800": "#0a3a63",

  "magenta-500": "#ff4fd8", // decorative display magenta — fails contrast
  "magenta-700": "#a8006e", // AA-passing working magenta
  "magenta-300": "#ff8ae8", // dark-scheme accent (light enough on navy)

  "blue-500": "#3b82f6",
  "blue-400": "#60a5fa",
  "green-600": "#16a34a",
  "green-400": "#4ade80",
  "amber-600": "#d97706",
  "amber-400": "#fbbf24",
  "red-600": "#dc2626",
  "red-400": "#f87171",
} as const;

export type DlsPrimitiveToken = keyof typeof DLS_PRIMITIVES;

// ---------------------------------------------------------------------------
// Tier 2 — semantic tokens
// ---------------------------------------------------------------------------

export type DlsColorToken =
  | "surface" // primary background
  | "surface-2" // recessed background (cards on surface, zebra rows)
  | "ink" // primary text
  | "muted" // secondary text
  | "border"
  | "brand" // brand navy — brand-owned, never themed by hosts
  | "accent" // AA-passing working magenta — brand-owned, functional UI
  | "accent-display" // decorative display magenta — brand-owned, never functional
  | "on-brand" // text on brand/accent fills
  | "info"
  | "success"
  | "warning"
  | "danger";

export type DlsTypographyToken =
  | "font-sans" // Poppins (Latin) / Vazirmatn (fa) / Noto Sans Bengali (bn)
  | "font-mono"
  | "text-xs"
  | "text-sm"
  | "text-md"
  | "text-lg"
  | "weight-normal"
  | "weight-medium"
  | "weight-semibold";

export type DlsShapeToken =
  | "radius-sm"
  | "radius-md"
  | "radius-lg"
  | "radius-full"
  | "border-width"
  | "shadow-sm";

/** 4px-based spacing scale. */
export type DlsSpaceToken =
  | "space-1" // 4px
  | "space-2" // 8px
  | "space-3" // 12px
  | "space-4" // 16px
  | "space-5" // 24px
  | "space-6"; // 32px

export type DlsToken =
  | DlsColorToken
  | DlsTypographyToken
  | DlsShapeToken
  | DlsSpaceToken;

/** Semantic intent shared by badges, buttons, callouts and row accents. */
export type DlsTone =
  | "neutral"
  | "brand"
  | "info"
  | "success"
  | "warning"
  | "danger";

// ---------------------------------------------------------------------------
// Default (light) values — the brand baseline. Colors resolve from
// DLS_PRIMITIVES (tier 1); nothing here is a hand-typed hex that could drift
// from the primitive ramp.
// ---------------------------------------------------------------------------

const P = DLS_PRIMITIVES;

export const DLS_TOKENS: Record<DlsToken, string> = {
  surface: P.white,
  "surface-2": P["slate-50"],
  ink: P["slate-900"],
  muted: P["slate-600"],
  border: P["slate-200"],
  brand: P["brand-700"],
  accent: P["magenta-700"],
  "accent-display": P["magenta-500"],
  "on-brand": P.white,
  info: P["blue-500"],
  success: P["green-600"],
  warning: P["amber-600"],
  danger: P["red-600"],

  "font-sans":
    "'Poppins', 'Vazirmatn', 'Noto Sans Bengali', ui-sans-serif, system-ui, sans-serif",
  "font-mono": "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
  "text-xs": "11px",
  "text-sm": "13px",
  "text-md": "14.5px",
  "text-lg": "18px",
  "weight-normal": "400",
  "weight-medium": "500",
  "weight-semibold": "600",

  "radius-sm": "6px",
  "radius-md": "10px",
  "radius-lg": "14px",
  "radius-full": "999px",
  "border-width": "1px",
  "shadow-sm": "0 1px 2px rgba(15, 23, 42, 0.06)",

  "space-1": "4px",
  "space-2": "8px",
  "space-3": "12px",
  "space-4": "16px",
  "space-5": "24px",
  "space-6": "32px",
};

/**
 * Dark-scheme overrides. Neutral tokens change (surfaces/ink/border/status);
 * `accent` gets its own dark-safe magenta shade (still brand-owned — this is
 * the brand's dark palette choice, not host theming). `accent-display` stays
 * put: it's decorative-only and the hero treatment doesn't run in dark mode
 * today.
 */
export const DLS_TOKENS_DARK: Partial<Record<DlsToken, string>> = {
  surface: P["navy-800"],
  "surface-2": P["navy-700"],
  ink: "#e2e8f0",
  muted: P["slate-400"],
  border: P["slate-200-dark"],
  accent: P["magenta-300"],
  info: P["blue-400"],
  success: P["green-400"],
  warning: P["amber-400"],
  danger: P["red-400"],
};

/**
 * MCP Apps host style variables that may override neutral DLS tokens when a
 * view renders inside an agent host (values arrive via `hostContext.styles`).
 * Brand-owned tokens (`brand`, `accent`, `accent-display`, `on-brand`) are
 * deliberately absent.
 */
export const DLS_HOST_VARIABLE_MAP: Partial<Record<DlsToken, string>> = {
  surface: "--color-background-primary",
  "surface-2": "--color-background-secondary",
  ink: "--color-text-primary",
  muted: "--color-text-secondary",
  border: "--color-border-primary",
  info: "--color-text-info",
  success: "--color-text-success",
  warning: "--color-text-warning",
  danger: "--color-text-danger",
  "font-sans": "--font-sans",
  "font-mono": "--font-mono",
  "radius-md": "--border-radius-md",
  "shadow-sm": "--shadow-sm",
};

// ---------------------------------------------------------------------------
// Tier 3 — component tokens
// ---------------------------------------------------------------------------

/**
 * Named aliases for the component rules in docs/dls.md ("Component rules"
 * section) — data form of what was previously prose-only, so a shared
 * component layer (Base UI, Phase 1) can consume it directly instead of
 * re-deriving which semantic token each part of a component should use.
 * Each value is a `DlsToken` name, not a literal — resolve it through
 * `DLS_TOKENS` / `dlsVar` like any other semantic reference.
 */
export const DLS_COMPONENT_TOKENS = {
  "card-surface": "surface",
  "card-border": "border",
  "card-radius": "radius-md",
  "card-shadow": "shadow-sm",

  "chip-neutral-bg": "surface-2",
  "chip-brand-bg": "brand",
  "chip-radius": "radius-full",

  "button-radius": "radius-sm",
  "button-hover-border": "accent",
  "button-filled-text": "on-brand",

  "table-row-hover": "surface-2",
  "table-urgent-rule": "danger",

  "callout-bg": "surface-2",

  "form-input-border": "border",
  "form-input-radius": "radius-sm",
  "form-focus-ring": "accent",
} as const satisfies Record<string, DlsToken>;

export type DlsComponentToken = keyof typeof DLS_COMPONENT_TOKENS;

/** CSS custom-property name for a DLS token (e.g. `--dk-surface-2`). */
export const dlsVar = (token: DlsToken): string => `--dk-${token}`;
