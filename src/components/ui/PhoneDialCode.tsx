import { cn } from "@/lib/cn";

/**
 * Country calling-code prefix for phone inputs. Renders "+" and digits as
 * separate LTR fragments so "+966" never reorders to "966+" inside Arabic UI.
 */
export function PhoneDialCode({
  dialCode,
  className,
}: {
  dialCode: string;
  className?: string;
}) {
  const digits = dialCode.startsWith("+") ? dialCode.slice(1) : dialCode;

  return (
    <span
      dir="ltr"
      className={cn(
        "inline-flex h-full shrink-0 items-center border-e border-ink-200 px-3 text-sm font-medium text-ink-700 [unicode-bidi:isolate]",
        className
      )}
    >
      <span aria-hidden="true">+</span>
      <span>{digits}</span>
    </span>
  );
}
