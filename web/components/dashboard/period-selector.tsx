"use client";

import { PeriodDays } from "@/lib/dashboard";
import { cn } from "@/lib/utils";

const OPTIONS: PeriodDays[] = [7, 30, 90];

export function PeriodSelector({
  value,
  onChange,
  disabled,
}: {
  value: PeriodDays;
  onChange: (days: PeriodDays) => void;
  disabled?: boolean;
}) {
  return (
    <div
      role="group"
      aria-label="Período"
      className="inline-flex rounded-lg border bg-muted/40 p-0.5"
    >
      {OPTIONS.map((option) => (
        <button
          key={option}
          type="button"
          disabled={disabled}
          aria-pressed={value === option}
          onClick={() => onChange(option)}
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-medium tabular-nums transition-colors disabled:opacity-50",
            value === option
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option} dias
        </button>
      ))}
    </div>
  );
}
