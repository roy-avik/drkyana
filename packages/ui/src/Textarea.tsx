import * as React from "react";

/**
 * Shared Textarea primitive (Phase 1 — Base UI component layer). Same
 * visual treatment as Input (surface + border + radius-sm, focus ring
 * accent) since docs/dls.md's Form rule doesn't distinguish input types.
 * Plain <textarea> — Base UI has no textarea primitive (a <textarea>
 * needs no special ARIA/behavior wiring, same reasoning as Card).
 *
 * No min-h-11 here — textareas size themselves for multi-line content
 * (callers already pass an appropriate min-h-* per usage), unlike Button/
 * Input/Chip where the touch-target floor is the concern.
 */
export interface TextareaProps
  extends React.ComponentPropsWithoutRef<"textarea"> {}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea({ className = "", ...props }, ref) {
    const classes = [
      "w-full rounded-sm border border-ink/15 bg-surface px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:opacity-50",
      className,
    ]
      .filter(Boolean)
      .join(" ");
    return <textarea ref={ref} className={classes} {...props} />;
  },
);
