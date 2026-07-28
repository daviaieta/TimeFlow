"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { shiftDayKey } from "@/lib/schedule";

interface DayNavigatorProps {
  dayKey: string;
  todayKey: string;
  onChange: (dayKey: string) => void;
}

export function DayNavigator({ dayKey, todayKey, onChange }: DayNavigatorProps) {
  return (
    <div className="flex items-center gap-1.5">
      <Button
        variant="outline"
        size="icon-sm"
        aria-label="Dia anterior"
        onClick={() => onChange(shiftDayKey(dayKey, -1))}
      >
        <HugeiconsIcon icon={ArrowLeft01Icon} />
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={dayKey === todayKey}
        onClick={() => onChange(todayKey)}
      >
        Hoje
      </Button>
      <Button
        variant="outline"
        size="icon-sm"
        aria-label="Próximo dia"
        onClick={() => onChange(shiftDayKey(dayKey, 1))}
      >
        <HugeiconsIcon icon={ArrowRight01Icon} />
      </Button>
      <Input
        type="date"
        aria-label="Escolher data"
        value={dayKey}
        onChange={(event) => {
          // Limpar o campo dispara onChange com "" — manter o dia atual.
          if (event.target.value) onChange(event.target.value);
        }}
        className="h-8 w-[9.5rem] text-xs"
      />
    </div>
  );
}
