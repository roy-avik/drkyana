import * as React from "react";
import { Input as BaseInput } from "@base-ui/react/input";

/**
 * Shared Input primitive (Phase 1 — Base UI component layer). Implements
 * the Form rule in docs/dls.md: inputs get `surface` + `border` +
 * `radius-sm` (the DLS_COMPONENT_TOKENS `form-input-*` tokens); focus ring
 * is `accent`. 44px min touch target, matching Button.
 *
 * Note: this is a plain radius-sm — the pre-existing hand-styled `.input`
 * Tailwind class (globals.css) used `rounded-lg`. This primitive follows
 * the already-documented spec rather than carrying that inconsistency
 * forward.
 */
export interface InputProps
  extends Omit<React.ComponentProps<typeof BaseInput>, "className"> {
  className?: string;
}

export const Input = React.forwardRef<HTMLElement, InputProps>(
  function Input({ className = "", ...props }, ref) {
    const classes = [
      "min-h-11 w-full rounded-sm border border-ink/15 bg-surface px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:opacity-50",
      className,
    ]
      .filter(Boolean)
      .join(" ");
    return <BaseInput ref={ref} className={classes} {...props} />;
  },
);
