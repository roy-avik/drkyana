import * as React from "react";
import { Input as BaseInput } from "@base-ui/react/input";

/**
 * Shared Input primitive (Phase 1 — Base UI component layer). Implements
 * the Form rule in docs/dls.md: inputs get `surface` + `border` +
 * `radius-sm` (the DLS_COMPONENT_TOKENS `form-input-*` tokens); focus ring
 * is `accent`. 44px min touch target, matching Button.
 *
 * `shape="pill"` is patient's marketing/chat-widget treatment (radius-full,
 * brand-tinted focus ring) matching the OTP step's original hand-rolled
 * styling — a deliberately different surface from admin's flat look, not
 * something to flatten onto it.
 *
 * Note: `flat` is a plain radius-sm — the pre-existing hand-styled `.input`
 * Tailwind class (globals.css) used `rounded-lg`. This primitive follows
 * the already-documented spec rather than carrying that inconsistency
 * forward.
 */
export type InputShape = "flat" | "pill";

const SHAPE_CLASSES: Record<InputShape, string> = {
  flat: "rounded-sm border-ink/15 px-3 focus:border-accent focus:ring-2 focus:ring-accent/20",
  pill: "rounded-full border-ink/10 px-4 focus:ring-2 focus:ring-brand/30",
};

export interface InputProps
  extends Omit<React.ComponentProps<typeof BaseInput>, "className"> {
  className?: string;
  shape?: InputShape;
}

export const Input = React.forwardRef<HTMLElement, InputProps>(
  function Input({ className = "", shape = "flat", ...props }, ref) {
    const classes = [
      "min-h-11 w-full border bg-surface py-2 text-sm text-ink outline-none transition-colors disabled:opacity-50",
      SHAPE_CLASSES[shape],
      className,
    ]
      .filter(Boolean)
      .join(" ");
    return <BaseInput ref={ref} className={classes} {...props} />;
  },
);
