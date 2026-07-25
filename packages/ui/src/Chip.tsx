import * as React from "react";
import { Toggle } from "@base-ui/react/toggle";

/**
 * Shared Chip primitive (Phase 1 — Base UI component layer) for the
 * selectable-pill pattern used by filter/status toggles (StatusControl,
 * DraftList/IntakeQueue's filter pills) — NOT the same thing as a
 * display-only status badge (docs/dls.md's "Chip/badge" rule, already
 * covered by the plain `.chip` CSS class + TRIAGE_CLASS/STATUS_LABEL
 * etc.). This is an interactive, pressable toggle styled as a pill:
 * `border-brand bg-brand text-white` when pressed, outlined/muted when
 * not — the same two states these components already hand-rolled.
 *
 * Wraps Base UI's Toggle (not ToggleGroup) — callers already manage their
 * own selection state (a single string, or a Set for multi-select), so a
 * controlled `pressed`/`onPressedChange` per chip fits without adopting
 * ToggleGroup's own value-array state model.
 *
 * Toggle sets `aria-pressed` (a real ARIA state, not a `data-pressed`
 * custom attribute — confirmed by reading Toggle.js's source), so this
 * uses Tailwind's built-in `aria-pressed:` variant, not `data-[pressed]`.
 */
export interface ChipProps
  extends Omit<React.ComponentProps<typeof Toggle>, "className"> {
  className?: string;
}

export const Chip = React.forwardRef<HTMLButtonElement, ChipProps>(
  function Chip({ className = "", ...props }, ref) {
    const classes = [
      "inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-full border px-3 text-sm font-medium transition-colors",
      "border-ink/15 bg-surface text-muted hover:border-accent/40",
      "aria-pressed:border-brand aria-pressed:bg-brand aria-pressed:text-white",
      className,
    ]
      .filter(Boolean)
      .join(" ");
    return <Toggle ref={ref} className={classes} {...props} />;
  },
);
