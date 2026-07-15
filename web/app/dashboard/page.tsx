import type { Metadata } from "next";
import Link from "next/link";
import { DailyBookingsChart, Sparkline, WeeklyRevenueChart } from "./charts";

export const metadata: Metadata = {
  title: "Visão geral — Bookly",
};

/* ------------------------------------ Mock data ------------------------------------ */

const dailyBookings = [
  { label: "15/06", value: 24 },
  { label: "16/06", value: 31 },
  { label: "17/06", value: 28 },
  { label: "18/06", value: 35 },
  { label: "19/06", value: 42 },
  { label: "20/06", value: 51 },
  { label: "21/06", value: 22 },
  { label: "22/06", value: 26 },
  { label: "23/06", value: 33 },
  { label: "24/06", value: 30 },
  { label: "25/06", value: 38 },
  { label: "26/06", value: 44 },
  { label: "27/06", value: 53 },
  { label: "28/06", value: 25 },
  { label: "29/06", value: 27 },
  { label: "30/06", value: 34 },
  { label: "01/07", value: 32 },
  { label: "02/07", value: 39 },
  { label: "03/07", value: 46 },
  { label: "04/07", value: 55 },
  { label: "05/07", value: 24 },
  { label: "06/07", value: 29 },
  { label: "07/07", value: 36 },
  { label: "08/07", value: 34 },
  { label: "09/07", value: 41 },
  { label: "10/07", value: 48 },
  { label: "11/07", value: 57 },
  { label: "12/07", value: 26 },
  { label: "13/07", value: 31 },
  { label: "14/07", value: 43 },
];

const weeklyRevenue = [
  { label: "26/05", value: 3480 },
  { label: "02/06", value: 3920 },
  { label: "09/06", value: 3610 },
  { label: "16/06", value: 4250 },
  { label: "23/06", value: 4580 },
  { label: "30/06", value: 4310 },
  { label: "07/07", value: 5120 },
  { label: "14/07", value: 5460 },
];

const kpis = [
  {
    label: "Agendamentos no mês",
    value: "1.042",
    delta: "+12% vs mês anterior",
    up: true,
    upIsGood: true,
    trend: [24, 28, 26, 31, 30, 34, 33, 38, 36, 41, 44, 43],
  },
  {
    label: "Faturamento no mês",
    value: "R$ 18.240",
    delta: "+8% vs mês anterior",
    up: true,
    upIsGood: true,
    trend: [3480, 3920, 3610, 4250, 4580, 4310, 5120, 5460, 5200, 5680, 5540, 6010],
  },
  {
    label: "Taxa de ocupação",
    value: "76%",
    delta: "+4 p.p. vs mês anterior",
    up: true,
    upIsGood: true,
    trend: [61, 63, 60, 66, 68, 65, 70, 72, 71, 74, 73, 76],
  },
  {
    label: "Faltas (no-show)",
    value: "3,2%",
    delta: "-1,1 p.p. vs mês anterior",
    up: false,
    upIsGood: false,
    trend: [6.1, 5.8, 5.9, 5.2, 4.8, 5.0, 4.4, 4.1, 3.9, 3.6, 3.4, 3.2],
  },
];

const topServices = [
  { name: "Corte feminino", count: 96 },
  { name: "Corte masculino", count: 91 },
  { name: "Barba", count: 72 },
  { name: "Coloração", count: 58 },
  { name: "Manicure", count: 44 },
];

const occupancy = [
  { name: "Camila Rocha", pct: 88 },
  { name: "João Pereira", pct: 79 },
  { name: "Fernanda Nunes", pct: 71 },
  { name: "Ricardo Santos", pct: 64 },
];

type Status = "confirmado" | "pendente" | "cancelado";

const appointments: {
  time: string;
  client: string;
  service: string;
  professional: string;
  price: string;
  status: Status;
}[] = [
  { time: "09:00", client: "Ana Souza", service: "Corte e escova", professional: "Camila Rocha", price: "R$ 120", status: "confirmado" },
  { time: "10:30", client: "Pedro Martins", service: "Barba e cabelo", professional: "João Pereira", price: "R$ 85", status: "confirmado" },
  { time: "11:00", client: "Carla Dias", service: "Coloração", professional: "Fernanda Nunes", price: "R$ 260", status: "pendente" },
  { time: "13:30", client: "Lucas Ferreira", service: "Corte masculino", professional: "João Pereira", price: "R$ 60", status: "confirmado" },
  { time: "15:00", client: "Beatriz Lima", service: "Manicure", professional: "Ricardo Santos", price: "R$ 55", status: "cancelado" },
  { time: "16:30", client: "Marcos Oliveira", service: "Corte e barba", professional: "Camila Rocha", price: "R$ 95", status: "pendente" },
];

/* ------------------------------------ UI helpers ------------------------------------ */

const navItems = [
  { label: "Visão geral", active: true },
  { label: "Agenda", active: false },
  { label: "Clientes", active: false },
  { label: "Serviços", active: false },
  { label: "Pagamentos", active: false },
  { label: "Relatórios", active: false },
  { label: "Configurações", active: false },
];

function StatusBadge({ status }: { status: Status }) {
  if (status === "confirmado") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-400">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="h-3 w-3">
          <path d="M4 12.5l5 5L20 6.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Confirmado
      </span>
    );
  }
  if (status === "pendente") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-400">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-3 w-3">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Pendente
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-800 dark:bg-red-950 dark:text-red-400">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="h-3 w-3">
        <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
      </svg>
      Cancelado
    </span>
  );
}

/* ------------------------------------- Página ------------------------------------- */

export default function Dashboard() {
  return (
    <div className="flex min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      {/* Sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-zinc-200 bg-white px-4 py-6 lg:flex dark:border-zinc-800 dark:bg-zinc-900">
        <Link href="/" className="flex items-center gap-2 px-2 font-semibold tracking-tight">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4.5 w-4.5">
              <rect x="3" y="4" width="18" height="17" rx="3" />
              <path d="M8 2v4M16 2v4M8.5 14.5l2.5 2.5 4.5-5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="text-lg">Bookly</span>
        </Link>
        <nav className="mt-8 flex flex-col gap-1">
          {navItems.map((item) => (
            <Link
              key={item.label}
              href="#"
              aria-current={item.active ? "page" : undefined}
              className={
                item.active
                  ? "rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-400"
                  : "rounded-lg px-3 py-2 text-sm text-zinc-600 transition-colors hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white"
              }
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto flex items-center gap-3 rounded-lg px-2 py-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-200 text-sm font-semibold text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200">
            DA
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">Davi Aieta</p>
            <p className="truncate text-xs text-zinc-500">Studio Aieta</p>
          </div>
        </div>
      </aside>

      {/* Conteúdo */}
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/80">
          <div className="flex h-16 items-center justify-between gap-4 px-6">
            <h1 className="text-lg font-semibold tracking-tight">Visão geral</h1>
            <button className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500">
              Novo agendamento
            </button>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-6 py-8">
          {/* Filtros — uma linha, acima de tudo que escopam */}
          <div className="flex flex-wrap items-center gap-2">
            {["Hoje", "7 dias", "30 dias", "90 dias"].map((range) => {
              const selected = range === "30 dias";
              return (
                <button
                  key={range}
                  aria-pressed={selected}
                  className={
                    selected
                      ? "rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-zinc-900"
                      : "rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800"
                  }
                >
                  {range}
                </button>
              );
            })}
            <span className="ml-1 text-xs text-zinc-500">15/06 – 14/07/2026</span>
          </div>

          {/* KPIs */}
          <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {kpis.map((kpi) => {
              const good = kpi.up === kpi.upIsGood;
              return (
                <div
                  key={kpi.label}
                  className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <p className="text-xs text-zinc-500">{kpi.label}</p>
                  <div className="mt-2 flex items-end justify-between gap-3">
                    <p className="text-2xl font-semibold tracking-tight">{kpi.value}</p>
                    <Sparkline points={kpi.trend} />
                  </div>
                  <p
                    className={
                      good
                        ? "mt-2 flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400"
                        : "mt-2 flex items-center gap-1 text-xs font-medium text-red-700 dark:text-red-400"
                    }
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      className={kpi.up ? "h-3 w-3" : "h-3 w-3 rotate-180"}
                    >
                      <path d="M12 19V5M5 12l7-7 7 7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {kpi.delta}
                  </p>
                </div>
              );
            })}
          </section>

          {/* Gráficos */}
          <section className="mt-6 grid gap-4 xl:grid-cols-2">
            <DailyBookingsChart data={dailyBookings} />
            <WeeklyRevenueChart data={weeklyRevenue} />
          </section>

          <section className="mt-6 grid gap-4 xl:grid-cols-3">
            {/* Agendamentos de hoje */}
            <div className="rounded-2xl border border-zinc-200 bg-white p-5 xl:col-span-2 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold">Agendamentos de hoje</h3>
                  <p className="text-xs text-zinc-500">Quarta-feira, 15 de julho</p>
                </div>
                <Link href="#" className="text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400">
                  Ver agenda completa
                </Link>
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[36rem] text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500 dark:border-zinc-800">
                      <th className="py-2 pr-4 font-medium">Horário</th>
                      <th className="py-2 pr-4 font-medium">Cliente</th>
                      <th className="py-2 pr-4 font-medium">Serviço</th>
                      <th className="py-2 pr-4 font-medium">Profissional</th>
                      <th className="py-2 pr-4 text-right font-medium">Valor</th>
                      <th className="py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {appointments.map((appt) => (
                      <tr
                        key={`${appt.time}-${appt.client}`}
                        className="border-b border-zinc-100 last:border-0 dark:border-zinc-800/60"
                      >
                        <td className="py-3 pr-4 font-medium tabular-nums">{appt.time}</td>
                        <td className="py-3 pr-4">{appt.client}</td>
                        <td className="py-3 pr-4 text-zinc-600 dark:text-zinc-400">{appt.service}</td>
                        <td className="py-3 pr-4 text-zinc-600 dark:text-zinc-400">{appt.professional}</td>
                        <td className="py-3 pr-4 text-right tabular-nums">{appt.price}</td>
                        <td className="py-3">
                          <StatusBadge status={appt.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              {/* Serviços mais agendados */}
              <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
                <h3 className="text-sm font-semibold">Serviços mais agendados</h3>
                <p className="text-xs text-zinc-500">Últimos 30 dias</p>
                <ul className="mt-4 space-y-3">
                  {topServices.map((service) => (
                    <li key={service.name}>
                      <div className="flex items-baseline justify-between text-sm">
                        <span className="text-zinc-700 dark:text-zinc-300">{service.name}</span>
                        <span className="font-medium tabular-nums">{service.count}</span>
                      </div>
                      <div className="mt-1.5 h-2 rounded-full bg-zinc-100 dark:bg-zinc-800">
                        <div
                          className="h-2 rounded-full bg-emerald-600"
                          style={{ width: `${(service.count / topServices[0].count) * 100}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Ocupação por profissional */}
              <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
                <h3 className="text-sm font-semibold">Ocupação por profissional</h3>
                <p className="text-xs text-zinc-500">Semana atual</p>
                <ul className="mt-4 space-y-3">
                  {occupancy.map((person) => (
                    <li key={person.name}>
                      <div className="flex items-baseline justify-between text-sm">
                        <span className="text-zinc-700 dark:text-zinc-300">{person.name}</span>
                        <span className="font-medium tabular-nums">{person.pct}%</span>
                      </div>
                      <div className="mt-1.5 h-2 rounded-full bg-emerald-100 dark:bg-emerald-950">
                        <div className="h-2 rounded-full bg-emerald-600" style={{ width: `${person.pct}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
