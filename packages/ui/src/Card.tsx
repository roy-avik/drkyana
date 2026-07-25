import * as React from "react";

/**
 * Card rule in docs/dls.md: `surface` + `border` + `radius-md` + `shadow-sm`
 * — the only container; sections, forms and tables live in cards. Arbitrary
 * values (`rounded-[10px]`, the exact `border` token rgba) rather than
 * Tailwind's named `rounded-md`/`rounded-lg`/`rounded-xl` scale, none of
 * which match `radius-md`'s 10px exactly — this is the "3 incompatible Card
 * defs" the Phase 1 audit found (patient used `rounded-2xl`/`ring-ink/5`,
 * admin used `rounded-xl`/`border-ink/10`).
 *
 * Plain `<div>` — no Base UI primitive needed, a card has no interactive
 * behavior of its own. `cardClassName` is exported separately for the rare
 * case a caller needs the styling on a non-div element (e.g. Next's `Link`
 * rendered as a card).
 */
export const cardClassName =
  "rounded-[10px] border border-[rgba(15,23,42,0.12)] bg-surface shadow-sm";

export interface CardProps extends React.ComponentPropsWithoutRef<"div"> {}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  function Card({ className = "", ...props }, ref) {
    const classes = [cardClassName, "p-4", className].filter(Boolean).join(" ");
    return <div ref={ref} className={classes} {...props} />;
  },
);
