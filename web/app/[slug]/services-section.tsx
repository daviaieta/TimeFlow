import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight02Icon } from "@hugeicons/core-free-icons";
import { type PublicBusiness, formatPrice } from "@/lib/publicBooking";
import { formatMinutes } from "@/lib/schedule";

interface ServicesSectionProps {
  catalog: PublicBusiness;
}

export function ServicesSection({ catalog }: ServicesSectionProps) {
  if (catalog.services.length === 0) {
    return null;
  }

  const slug = catalog.business.slug;

  return (
    <section className="mx-auto w-full max-w-4xl px-5 py-12 sm:px-8">
      <h2 className="text-[22px] font-semibold tracking-[-0.015em]">Serviços</h2>

      <ul className="mt-5 grid gap-3 sm:grid-cols-2">
        {catalog.services.map((service) => (
          <li key={service.id}>
            <Link
              href={`/${slug}/agendar?servico=${service.id}`}
              className="group flex items-center justify-between gap-4 rounded-2xl border p-4 transition-colors duration-200 hover:border-foreground/20 hover:bg-muted/40 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{service.name}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {formatMinutes(service.duration)} ·{" "}
                  <span className="font-mono tabular-nums">
                    {formatPrice(service.price)}
                  </span>
                </p>
              </div>
              <HugeiconsIcon
                icon={ArrowRight02Icon}
                className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none"
              />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
