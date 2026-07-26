import { TeamAvatar } from "@/components/team-avatar";
import { type PublicBusiness, nextSlotLabel } from "@/lib/publicBooking";
import { servicesByEmployee } from "@/lib/showcase";

interface TeamSectionProps {
  catalog: PublicBusiness;
  todayKey: string;
}

export function TeamSection({ catalog, todayKey }: TeamSectionProps) {
  if (catalog.professionals.length === 0) {
    return null;
  }

  const owned = servicesByEmployee(catalog.services);

  return (
    <section className="mx-auto w-full max-w-4xl px-5 pb-12 sm:px-8">
      <h2 className="text-[22px] font-semibold tracking-[-0.015em]">Equipe</h2>

      <ul className="mt-5 grid gap-3 sm:grid-cols-2">
        {catalog.professionals.map((professional) => {
          const services = owned.get(professional.id) ?? [];

          return (
            <li
              key={professional.id}
              className="flex items-start gap-4 rounded-2xl border p-4"
            >
              <TeamAvatar name={professional.name} />

              <div className="min-w-0">
                <p className="truncate font-medium">{professional.name}</p>

                {services.length > 0 && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {services.join(" · ")}
                  </p>
                )}

                {professional.nextSlot && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Livre{" "}
                    <span className="font-mono tabular-nums">
                      {nextSlotLabel(professional.nextSlot, todayKey)}
                    </span>
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
