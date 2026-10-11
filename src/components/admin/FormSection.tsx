"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "@/components/icons";
import { cn } from "@/lib/cn";

interface FormSectionProps {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  /** When set, the header becomes a toggle that shows/hides the body — starts
   *  closed unless defaultOpen is true. Omit for a normal always-open card. */
  collapsible?: boolean;
  defaultOpen?: boolean;
}

/**
 * One titled panel in an admin form. Shared by the product and category forms so
 * both read as the same system — previously this lived privately inside
 * ProductForm while CategoryForm hand-rolled bare <section> elements, which is why
 * only one of the two could collapse.
 *
 * Collapsible sections default to CLOSED: these forms are long, and the heavy
 * per-region / per-zone panels push the primary fields far down the page when they
 * are all expanded at once.
 */
export function FormSection({
  title,
  description,
  action,
  children,
  collapsible,
  defaultOpen,
}: FormSectionProps) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  const showBody = !collapsible || open;
  return (
    <section className="rounded-2xl border border-ink-100 bg-white p-5 sm:p-6">
      <header className={cn("flex items-start justify-between gap-3", showBody && "mb-4")}>
        {collapsible ? (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="flex flex-1 items-start justify-between gap-3 text-left"
          >
            <div>
              <h3 className="font-display text-lg text-ink-900">{title}</h3>
              {description ? <p className="text-xs text-ink-500">{description}</p> : null}
            </div>
            <ChevronDown
              size={16}
              className={cn(
                "mt-1 shrink-0 text-ink-500 transition-transform",
                open && "rotate-180"
              )}
            />
          </button>
        ) : (
          <div>
            <h3 className="font-display text-lg text-ink-900">{title}</h3>
            {description ? <p className="text-xs text-ink-500">{description}</p> : null}
          </div>
        )}
        {action}
      </header>
      {showBody ? children : null}
    </section>
  );
}
