import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  /** Shows a red asterisk after the label for required fields. */
  requiredMark?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  containerClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    label,
    hint,
    error,
    requiredMark,
    leadingIcon,
    trailingIcon,
    id,
    className,
    containerClassName,
    ...props
  },
  ref
) {
  const reactId = useId();
  const inputId = id ?? reactId;
  const describedBy = error
    ? `${inputId}-error`
    : hint
    ? `${inputId}-hint`
    : undefined;
  // A disabled/readOnly input is visually locked — mute the WHOLE wrapper (not just
  // the input's own background) so it doesn't render as a mismatched grey box floating
  // inside a white rounded border.
  const locked = Boolean(props.disabled || props.readOnly);
  // Keep dir on the wrapper so RTL text/caret isn't clipped by overflow + LTR flex.
  const { dir, ...inputProps } = props;
  const isRtl = dir === "rtl";

  return (
    <div className={cn("flex flex-col gap-1.5", containerClassName)}>
      {label && (
        <label
          htmlFor={inputId}
          className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-700"
        >
          {label}
          {requiredMark ? (
            <span className="ms-0.5 text-(--color-danger)" aria-hidden="true">
              *
            </span>
          ) : null}
        </label>
      )}
      <div
        dir={dir}
        className={cn(
          // overflow-hidden clips autofill to the rounded shape; for RTL it also clips
          // Arabic glyph overhang on the inline-start edge, so use overflow-x-auto there.
          "group flex items-center rounded-2xl border transition-all",
          isRtl ? "overflow-x-auto overflow-y-hidden" : "overflow-hidden",
          locked
            ? "cursor-not-allowed border-ink-100 bg-ink-50"
            : "bg-white focus-within:border-bloom-400 focus-within:ring-4 focus-within:ring-bloom-100",
          error
            ? "border-(--color-danger)"
            : !locked && "border-ink-200 hover:border-ink-300"
        )}
      >
        {leadingIcon && (
          <span className="ps-4 text-ink-400">{leadingIcon}</span>
        )}
        <input
          ref={ref}
          id={inputId}
          dir={dir}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={describedBy}
          className={cn(
            "min-w-0 w-full flex-1 bg-transparent px-4 py-3 text-base placeholder:text-ink-400 focus:outline-none",
            locked ? "cursor-not-allowed text-ink-500" : "text-ink-900",
            // dir=rtl already aligns to start; extra inline-start padding keeps first
            // Arabic glyphs from sitting flush against the rounded border.
            isRtl && "text-start ps-5 pe-4 [unicode-bidi:plaintext]",
            leadingIcon && "ps-2",
            trailingIcon && "pe-2",
            className
          )}
          {...inputProps}
        />
        {trailingIcon && (
          <span className="pe-4 text-ink-400">{trailingIcon}</span>
        )}
      </div>
      {error ? (
        <p
          id={`${inputId}-error`}
          className="text-xs text-(--color-danger)"
        >
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="text-xs text-ink-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
});
