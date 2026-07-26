import * as React from "react";
import { Select as BaseSelect } from "@base-ui/react/select";
import { cardClassName } from "./Card";

/**
 * Shared Select primitive (Phase 1 — Base UI component layer, the last of
 * the 6 planned primitives). Base UI's Select is a full compound component
 * (Root/Trigger/Value/Icon/Portal/Positioner/Popup/List/Item/ItemText/
 * ItemIndicator) — this wraps it behind a single flat props API shaped like
 * every current raw `<select>` usage in the app: a plain `{ value, label }[]`
 * options array (matching `IntakeFieldOption` and view-DSL's
 * `FormField.options` exactly), so callers don't touch the compound parts.
 *
 * Trigger follows the Form rule in docs/dls.md exactly like `<Input>`
 * (`radius-sm`, `border`, `form-focus-ring` accent, 44px touch target).
 * Popup reuses `cardClassName` (radius-md surface) — the same floating-
 * surface treatment every other dropdown/menu in the app already uses.
 *
 * Data attributes below were confirmed by reading Base UI's compiled source
 * (not assumed from convention) — same lesson as Chip's `aria-pressed` fix:
 * `SelectItem` emits plain `data-selected`/`data-highlighted` (no custom
 * `stateAttributesMapping`, so `getStateAttributesProps`'s default boolean
 * behavior applies); `SelectTrigger`/`SelectIcon` both use
 * `triggerOpenStateMapping`, which emits `data-popup-open` (not `data-open`
 * — that's the *popup's* own attribute, from a different mapping).
 */
export interface SelectOption {
  value: string;
  label: React.ReactNode;
}

export interface SelectProps {
  options: SelectOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  placeholder?: React.ReactNode;
  name?: string;
  disabled?: boolean;
  required?: boolean;
  /** Applied to the trigger — e.g. `"w-auto"` for a compact inline select. */
  className?: string;
}

export function Select({
  options,
  value,
  defaultValue,
  onValueChange,
  placeholder,
  name,
  disabled,
  required,
  className = "",
}: SelectProps) {
  return (
    <BaseSelect.Root<string>
      items={options}
      value={value}
      defaultValue={defaultValue}
      onValueChange={onValueChange && ((v) => onValueChange(v ?? ""))}
      name={name}
      disabled={disabled}
      required={required}
    >
      <BaseSelect.Trigger
        className={[
          "inline-flex min-h-11 w-full items-center justify-between gap-2 rounded-sm border border-ink/15 bg-surface px-3 py-2 text-sm text-ink outline-none transition-colors ease-spring focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:opacity-50",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <BaseSelect.Value placeholder={placeholder} className="truncate" />
        <BaseSelect.Icon className="shrink-0 text-muted transition-transform ease-spring data-[popup-open]:rotate-180">
          <ChevronIcon />
        </BaseSelect.Icon>
      </BaseSelect.Trigger>
      <BaseSelect.Portal>
        <BaseSelect.Positioner sideOffset={4} className="z-50">
          <BaseSelect.Popup
            className={`${cardClassName} max-h-64 overflow-auto p-1`}
          >
            <BaseSelect.List>
              {options.map((o) => (
                <BaseSelect.Item
                  key={o.value}
                  value={o.value}
                  className="flex cursor-default items-center gap-2 rounded-sm px-3 py-2 text-sm text-ink outline-none data-[highlighted]:bg-surface-alt data-[selected]:bg-brand/5 data-[selected]:font-medium"
                >
                  <BaseSelect.ItemText className="flex-1 truncate">
                    {o.label}
                  </BaseSelect.ItemText>
                  <BaseSelect.ItemIndicator className="shrink-0 text-accent">
                    ✓
                  </BaseSelect.ItemIndicator>
                </BaseSelect.Item>
              ))}
            </BaseSelect.List>
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  );
}

function ChevronIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-4 w-4"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
