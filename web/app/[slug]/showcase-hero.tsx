import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight02Icon } from "@hugeicons/core-free-icons";
import { BusinessMark } from "@/components/business-mark";
import { buttonVariants } from "@/components/ui/button";
import { formatBusinessName } from "@/lib/businessName";
import {
  type PublicBusiness,
  dayChipLabel,
  earliestNextSlot,
} from "@/lib/publicBooking";
import { businessGradient } from "@/lib/showcase";
import { cn } from "@/lib/utils";

const EYEBROW = "text-[11px] font-semibold uppercase tracking-[0.14em]";

interface ShowcaseHeroProps {
  catalog: PublicBusiness;
  todayKey: string;
}

export function ShowcaseHero({ catalog, todayKey }: ShowcaseHeroProps) {
  const name = formatBusinessName(catalog.business.name);
  const slug = catalog.business.slug;
  const { from, to } = businessGradient(slug);
  const next = earliestNextSlot(catalog.professionals);
  const hasServices = catalog.services.length > 0;

  return (
    <header>
      {/* Listra diagonal sobre a cor do negócio: toldo de fachada, o mais
          perto de uma vitrine física que dá para chegar sem foto nenhuma. */}
      <div
        aria-hidden
        style={{
          backgroundImage: `repeating-linear-gradient(115deg, rgba(255,255,255,0.07) 0 26px, transparent 26px 52px), linear-gradient(135deg, ${from}, ${to})`,
        }}
        className="h-36 w-full sm:h-48 lg:h-60"
      />

      <div className="mx-auto w-full max-w-4xl px-5 sm:px-8">
        <BusinessMark
          name={catalog.business.name}
          slug={slug}
          className="-mt-10 size-20 sm:-mt-12 sm:size-24"
        />

        <h1 className="mt-5 text-[30px] leading-[1.08] font-semibold tracking-[-0.025em] sm:text-[42px]">
          {name}
        </h1>

        {next ? (
          <div className="mt-7">
            <p className={cn(EYEBROW, "text-muted-foreground")}>
              Próximo horário livre ·{" "}
              {dayChipLabel(next.date.slice(0, 10), todayKey)}
            </p>
            <p className="mt-1 font-mono text-[44px] leading-none font-medium tracking-[-0.03em] tabular-nums sm:text-[56px]">
              {next.startTime}
            </p>
          </div>
        ) : (
          <p className="mt-7 text-[15px] text-muted-foreground">
            Nenhum horário aberto no momento. Os serviços e a equipe estão logo
            abaixo.
          </p>
        )}

        {hasServices && next && (
          <div className="mt-8">
            <Link
              href={`/${slug}/agendar`}
              className={cn(
                buttonVariants({ size: "lg" }),
                "h-12 w-full rounded-2xl text-[15px] sm:w-auto sm:px-8",
              )}
            >
              Agendar horário
              <HugeiconsIcon icon={ArrowRight02Icon} data-icon="inline-end" />
            </Link>
            <p className={cn(EYEBROW, "mt-4 text-muted-foreground")}>
              Sem criar conta · leva menos de um minuto
            </p>
          </div>
        )}
      </div>
    </header>
  );
}
