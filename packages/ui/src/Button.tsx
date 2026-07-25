import * as React from "react";
import { Button as BaseButton } from "@base-ui/react/button";

/**
 * Shared Button primitive (Phase 1 — Base UI component layer). Implements
 * the Button rule in docs/dls.md exactly: radius-sm; default (`neutral`)
 * outlined, hover borrows accent; `brand`/`success`/`danger` are filled with
 * on-brand (white) text.
 *
 * Wraps Base UI's `Button` rather than a plain `<button>` so callers get its
 * `render` prop for free — e.g. a link that needs to look like a button
 * (`<Button render={<a href="#services" />}>`) without losing button
 * semantics/keyboard behavior.
 */

export type ButtonTone = "neutral" | "brand" | "success" | "danger";

/**
 * `md` (44px, the default) is the Phase 1 touch-target decision (PR #67/
 * #68) — use it for anything a patient or Dr Kyana taps as a primary
 * action. `sm` formalizes the `btn-ghost py-1 text-xs` pattern already
 * hand-rolled identically in ChamberManager/DraftReview/KbManager/
 * AgentChat for DENSE SECONDARY actions inline in a list row (Edit,
 * Delete, +Slot, the Preview/Edit toggle) — not a license to shrink
 * primary actions back below 44px.
 */
export type ButtonSize = "md" | "sm";

/**
 * `flat` (radius-sm, the default) is admin's existing look, unchanged.
 * `pill` (radius-full + a hover lift) is patient's marketing/chat-widget
 * treatment (Hero CTAs, the OTP step, the intake form's back/skip controls)
 * — a deliberately different, more expressive surface for the public site,
 * not something to flatten onto admin's flat/utilitarian look.
 */
export type ButtonShape = "flat" | "pill";

const TONE_CLASSES: Record<ButtonTone, string> = {
  neutral: "border border-ink/15 bg-surface text-ink hover:border-accent hover:bg-surface-alt",
  brand: "border border-transparent bg-brand text-white hover:bg-brand/90",
  success: "border border-transparent bg-green text-white hover:bg-green/90",
  danger: "border border-transparent bg-red text-white hover:bg-red/90",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  md: "min-h-11 px-3 py-2 text-sm",
  sm: "min-h-0 px-2.5 py-1 text-xs",
};

const SHAPE_CLASSES: Record<ButtonShape, string> = {
  flat: "rounded-sm transition-colors ease-spring",
  pill: "rounded-full transition-all duration-200 ease-spring hover:-translate-y-0.5",
};

export interface ButtonProps
  extends Omit<React.ComponentProps<typeof BaseButton>, "className"> {
  tone?: ButtonTone;
  size?: ButtonSize;
  shape?: ButtonShape;
  className?: string;
}

export const Button = React.forwardRef<HTMLElement, ButtonProps>(
  function Button(
    { tone = "neutral", size = "md", shape = "flat", className = "", ...props },
    ref,
  ) {
    const classes = [
      "inline-flex items-center justify-center gap-2 font-medium disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
      SHAPE_CLASSES[shape],
      SIZE_CLASSES[size],
      TONE_CLASSES[tone],
      // `.btn-primary`'s hover glow (src/index.css) — pill + brand only.
      shape === "pill" && tone === "brand" ? "hover:shadow-lg hover:shadow-brand/25" : "",
      className,
    ]
      .filter(Boolean)
      .join(" ");
    return <BaseButton ref={ref} className={classes} {...props} />;
  },
);
