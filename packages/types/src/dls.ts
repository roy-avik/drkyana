/**
 * DLS — the Dr Kyana Design Language System.
 *
 * Single source of truth for the visual language every drkyana surface speaks:
 * the patient site, the admin PWA, and the MCP App views rendered inside agent
 * hosts. Tokens are plain data (client-safe) — each consumer materializes them
 * as CSS custom properties (`--dk-*`).
 *
 * Spec: docs/dls.md. Brand voice: calm, considered, modern.
 *
 * Host adaptation: inside an MCP App the host's style variables (MCP Apps
 * `McpUiStyles`, e.g. `--color-background-primary`) OVERRIDE the neutral
 * tokens so views feel native to Claude/other hosts, while brand-owned tokens
 * (brand, accent) never yield. `DLS_HOST_VARIABLE_MAP` declares which host
 * variable feeds which token.
 */

// ---------------------------------------------------------------------------
// Token names
// ---------------------------------------------------------------------------

export type DlsColorToken =
  | "surface" // primary background
  | "surface-2" // recessed background (cards on surface, zebra rows)
  | "ink" // primary text
  | "muted" // secondary text
  | "border"
  | "brand" // #0f4c81 — brand-owned, never themed by hosts
  | "accent" // #3b82f6 — brand-owned
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
// Default (light) values — the brand baseline.
// ---------------------------------------------------------------------------

export const DLS_TOKENS: Record<DlsToken, string> = {
  surface: "#ffffff",
  "surface-2": "#f8fafc",
  ink: "#0f172a",
  muted: "#475569",
  border: "rgba(15, 23, 42, 0.12)",
  brand: "#0f4c81",
  accent: "#3b82f6",
  "on-brand": "#ffffff",
  info: "#3b82f6",
  success: "#16a34a",
  warning: "#d97706",
  danger: "#dc2626",

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

/** Dark-scheme overrides (neutral tokens only — brand hues stay put). */
export const DLS_TOKENS_DARK: Partial<Record<DlsToken, string>> = {
  surface: "#0b1220",
  "surface-2": "#111a2c",
  ink: "#e2e8f0",
  muted: "#94a3b8",
  border: "rgba(226, 232, 240, 0.14)",
  accent: "#60a5fa",
  info: "#60a5fa",
  success: "#4ade80",
  warning: "#fbbf24",
  danger: "#f87171",
};

/**
 * MCP Apps host style variables that may override neutral DLS tokens when a
 * view renders inside an agent host (values arrive via `hostContext.styles`).
 * Brand-owned tokens (`brand`, `accent`, `on-brand`) are deliberately absent.
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

/** CSS custom-property name for a DLS token (e.g. `--dk-surface-2`). */
export const dlsVar = (token: DlsToken): string => `--dk-${token}`;
