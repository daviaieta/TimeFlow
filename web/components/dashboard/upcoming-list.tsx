import {
  UpcomingBooking,
  groupUpcomingByDay,
  relativeDayLabel,
} from "@/lib/dashboard";
import { localDayKey } from "@/lib/schedule";

export function UpcomingList({
  rows,
  showEmployee = true,
}: {
  rows: UpcomingBooking[];
  /** Falso no painel do colaborador: lá todo atendimento é dele. */
  showEmployee?: boolean;
}) {
  if (rows.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Nenhum atendimento marcado daqui pra frente.
      </p>
    );
  }

  const todayKey = localDayKey(new Date());

  return (
    <div className="flex flex-col gap-5">
      {groupUpcomingByDay(rows).map(([day, bookings]) => (
        <div key={day}>
          <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            {relativeDayLabel(day, todayKey)}
          </p>

          <ul className="mt-2 flex flex-col gap-2">
            {bookings.map((row) => (
              <li
                key={row.availabilityId}
                className="flex items-start gap-3 rounded-xl border bg-background/50 px-3 py-2.5"
              >
                <span className="shrink-0 text-sm font-semibold tabular-nums">
                  {row.startTime}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{row.clientName}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[
                      row.serviceName,
                      showEmployee ? row.employeeName : null,
                      `até ${row.endTime}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                {row.clientPhone ? (
                  // Quem abre isto no balcão precisa ligar para o cliente que
                  // não apareceu — o telefone é o próximo passo, não um dado.
                  <a
                    href={`tel:${row.clientPhone}`}
                    className="shrink-0 text-xs font-medium text-primary tabular-nums hover:underline"
                  >
                    {row.clientPhone}
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
