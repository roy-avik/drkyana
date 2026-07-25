import * as React from "react";
import { Button as BaseButton } from "@base-ui/react/button";

/**
 * Shared Button primitive (Phase 1 — Base UI component layer). Implements
 * the Button rule in docs/dls.md exactly: radius-sm; default (`neutral`)
 * outlined, hover borrows accent; `brand`/`success`/`danger` are filled with
 * on-brand (white) text. 44px min touch target throughout — no separate
 * compact size, per the Phase 1 touch-target decision (see PR #67/#68).
 *
 * Wraps Base UI's `Button` rather than a plain `<button>` so callers get its
 * `render` prop for free — e.g. a link that needs to look like a button
 * (`<Button render={<a href="#services" />}>`) without losing button
 * semantics/keyboard behavior.
 */

export type ButtonTone = "neutral" | "brand" | "success" | "danger";

const TONE_CLASSES: Record<ButtonTone, string> = {
  neutral: "border border-ink/15 bg-surface text-ink hover:border-accent hover:bg-surface-alt",
  brand: "border border-transparent bg-brand text-white hover:bg-brand/90",
  success: "border border-transparent bg-green text-white hover:bg-green/90",
  danger: "border border-transparent bg-red text-white hover:bg-red/90",
};

export interface ButtonProps
  extends Omit<React.ComponentProps<typeof BaseButton>, "className"> {
  tone?: ButtonTone;
  className?: string;
}

export const Button = React.forwardRef<HTMLElement, ButtonProps>(
  function Button({ tone = "neutral", className = "", ...props }, ref) {
    const classes = [
      "inline-flex min-h-11 items-center justify-center gap-2 rounded-sm px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
      TONE_CLASSES[tone],
      className,
    ]
      .filter(Boolean)
      .join(" ");
    return <BaseButton ref={ref} className={classes} {...props} />;
  },
);
