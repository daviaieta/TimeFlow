import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowRight02Icon,
  CalendarCheckIn01Icon,
  CheckmarkCircle02Icon,
  Link01Icon,
  ZapIcon,
} from "@hugeicons/core-free-icons";
import { LandingHeader } from "./landing-header";

const features = [
  {
    icon: CalendarCheckIn01Icon,
    title: "Sem conflitos de horário",
    description:
      "Dois clientes nunca reservam o mesmo horário. A disponibilidade é travada no momento da confirmação.",
  },
  {
    icon: ZapIcon,
    title: "Atualização em tempo real",
    description:
      "Quando um horário é reservado, ele desaparece na hora para quem ainda está escolhendo.",
  },
  {
    icon: Link01Icon,
    title: "Página pública por negócio",
    description:
      "Compartilhe seu link e receba reservas direto — o cliente não precisa criar conta.",
  },
];

const services = [
  {
    name: "Corte de cabelo",
    duration: "30 min",
    price: "R$ 45",
    selected: true,
  },
  { name: "Barba", duration: "20 min", price: "R$ 35", selected: false },
  {
    name: "Corte + Barba",
    duration: "45 min",
    price: "R$ 70",
    selected: false,
  },
];

const slots = ["09:00", "09:30", "10:00", "10:30", "11:00", "14:00"];

const plans = [
  {
    name: "Essencial",
    description: "Para autônomos começando a organizar a agenda.",
    price: "R$ 49,90",
    priceSuffix: "/mês",
    features: [
      "1 profissional",
      "Página pública de agendamento",
      "Reservas ilimitadas",
      "Confirmação por e-mail",
    ],
    highlighted: false,
  },
  {
    name: "Profissional",
    description: "Para negócios com equipe pequena.",
    price: "R$ 89,90",
    priceSuffix: "/mês",
    features: [
      "Até 5 profissionais",
      "Tudo do Essencial",
      "Agenda em tempo real",
      "Suporte prioritário",
    ],
    highlighted: true,
  },
  {
    name: "Equipe",
    description: "Para operações maiores, com várias unidades.",
    price: "R$ 179,90",
    priceSuffix: "/mês",
    features: [
      "Profissionais ilimitados",
      "Tudo do Profissional",
      "Múltiplas unidades",
      "Onboarding dedicado",
    ],
    highlighted: false,
  },
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <LandingHeader />

      {/* Hero */}
      <section
        id="produto"
        className="relative overflow-hidden scroll-mt-16 bg-gradient-to-b from-indigo-700 via-indigo-500 to-indigo-200 pb-24 dark:from-indigo-900 dark:via-indigo-800 dark:to-background"
      >
        <div className="mx-auto flex max-w-3xl flex-col items-center px-6 pt-20 text-center sm:pt-28">
          <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-6xl">
            Sua agenda online,
            <br />
            sem conflito de horário
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-indigo-50/90">
            Uma página de agendamento para o seu negócio. O cliente escolhe o
            serviço, o profissional e o horário — sem ligação, sem WhatsApp.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <a
              href="#recursos"
              className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-medium text-indigo-950 shadow-lg transition-all hover:bg-indigo-50 active:translate-y-px"
            >
              Conheça o produto
              <HugeiconsIcon icon={ArrowRight02Icon} className="size-4" />
            </a>
            <Link
              href="/contato"
              className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-medium text-white ring-1 ring-white/50 transition-all hover:bg-white/10 hover:ring-white active:translate-y-px"
            >
              Fale comigo
            </Link>
          </div>
        </div>

        {/* Mockup da client view */}
        <div aria-hidden className="mx-auto mt-20 w-full max-w-4xl px-6">
          <div className="overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5">
            <div className="flex items-center gap-4 border-b border-zinc-100 px-4 py-3">
              <div className="flex gap-1.5">
                <span className="size-3 rounded-full bg-red-400" />
                <span className="size-3 rounded-full bg-amber-400" />
                <span className="size-3 rounded-full bg-green-400" />
              </div>
              <div className="mx-auto flex h-7 w-full max-w-sm items-center justify-center rounded-md bg-zinc-100 text-xs text-zinc-500">
                timeflow/business
              </div>
              <div className="w-12" />
            </div>

            <div className="flex">
              <aside className="hidden w-56 shrink-0 border-r border-zinc-100 p-5 sm:block">
                <p className="text-sm font-semibold text-zinc-900">Business</p>
                <p className="mt-1 text-xs text-zinc-500">
                  Seg – Sáb · 9h às 19h
                </p>
                <ol className="mt-6 space-y-1 text-sm">
                  <li className="flex items-center gap-2 rounded-lg bg-indigo-50 px-3 py-2 font-medium text-indigo-700">
                    <span className="flex size-5 items-center justify-center rounded-full bg-indigo-600 text-xs text-white">
                      1
                    </span>
                    Serviço
                  </li>
                  <li className="flex items-center gap-2 px-3 py-2 text-zinc-400">
                    <span className="flex size-5 items-center justify-center rounded-full border border-zinc-200 text-xs">
                      2
                    </span>
                    Profissional
                  </li>
                  <li className="flex items-center gap-2 px-3 py-2 text-zinc-400">
                    <span className="flex size-5 items-center justify-center rounded-full border border-zinc-200 text-xs">
                      3
                    </span>
                    Horário
                  </li>
                </ol>
              </aside>

              <div className="flex-1 p-6 text-left">
                <p className="text-sm font-semibold text-zinc-900">
                  Escolha um serviço
                </p>
                <div className="mt-4 space-y-2">
                  {services.map((service) => (
                    <div
                      key={service.name}
                      className={`flex items-center justify-between rounded-xl border px-4 py-3 ${
                        service.selected
                          ? "border-indigo-500 bg-indigo-50/50 ring-1 ring-indigo-500"
                          : "border-zinc-200"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {service.selected ? (
                          <HugeiconsIcon
                            icon={CheckmarkCircle02Icon}
                            className="size-4 text-indigo-600"
                          />
                        ) : (
                          <span className="size-4 rounded-full border border-zinc-300" />
                        )}
                        <div>
                          <p className="text-sm font-medium text-zinc-900">
                            {service.name}
                          </p>
                          <p className="text-xs text-zinc-500">
                            {service.duration}
                          </p>
                        </div>
                      </div>
                      <p className="text-sm font-medium text-zinc-700">
                        {service.price}
                      </p>
                    </div>
                  ))}
                </div>

                <p className="mt-6 text-xs font-medium tracking-wide text-zinc-400 uppercase">
                  Horários de hoje
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {slots.map((slot, index) => (
                    <span
                      key={slot}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                        index === 2
                          ? "border-zinc-100 bg-zinc-50 text-zinc-300 line-through"
                          : "border-zinc-200 text-zinc-700"
                      }`}
                    >
                      {slot}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Recursos */}
      <section
        id="recursos"
        className="mx-auto w-full max-w-6xl scroll-mt-16 px-6 py-24"
      >
        <div className="grid gap-12 sm:grid-cols-3">
          {features.map((feature) => (
            <div key={feature.title}>
              <span className="flex size-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-400">
                <HugeiconsIcon icon={feature.icon} className="size-5" />
              </span>
              <h2 className="mt-4 text-base font-semibold">{feature.title}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Preços */}
      <section
        id="precos"
        className="scroll-mt-16 border-t bg-zinc-50/60 dark:bg-transparent"
      >
        <div className="mx-auto w-full max-w-6xl px-6 py-24">
          <div className="mx-auto max-w-xl text-center">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Um plano para cada fase do seu negócio
            </h2>
            <p className="mt-3 text-muted-foreground">
              Preço calculado a partir do custo real de operação, com margem
              sustentável — sem surpresa depois.
            </p>
          </div>

          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={`relative flex flex-col rounded-2xl border bg-card p-8 ${
                  plan.highlighted
                    ? "border-indigo-500 shadow-lg ring-1 ring-indigo-500"
                    : "shadow-sm"
                }`}
              >
                {plan.highlighted && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-indigo-600 px-3 py-1 text-xs font-medium text-white">
                    Mais popular
                  </span>
                )}
                <h3 className="text-base font-semibold">{plan.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {plan.description}
                </p>
                <p className="mt-6 text-3xl font-semibold tracking-tight">
                  {plan.price}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {plan.priceSuffix}
                </p>
                <ul className="mt-6 flex-1 space-y-3 text-sm">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2">
                      <HugeiconsIcon
                        icon={CheckmarkCircle02Icon}
                        className="size-4 shrink-0 text-cyan-500"
                      />
                      {feature}
                    </li>
                  ))}
                </ul>
                <a
                  href="#"
                  className={`mt-8 inline-flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-medium transition-colors ${
                    plan.highlighted
                      ? "bg-indigo-600 text-white hover:bg-indigo-700"
                      : "border hover:bg-muted"
                  }`}
                >
                  Falar com a gente
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA final */}
      <section className="border-t">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-6 px-6 py-20 text-center">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Pronto para abrir sua agenda?
          </h2>
          <p className="max-w-md text-muted-foreground">
            Negócios entram na plataforma por convite. Fale com a gente para
            cadastrar o seu — sua equipe recebe o acesso por e-mail.
          </p>
          <div className="flex flex-col items-center gap-3 sm:flex-row">
            <a
              href="#"
              className="inline-flex items-center gap-2 rounded-full bg-foreground px-6 py-3 text-sm font-medium text-background transition-opacity hover:opacity-85"
            >
              Falar com a gente
              <HugeiconsIcon icon={ArrowRight02Icon} className="size-4" />
            </a>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-full border px-6 py-3 text-sm font-medium transition-colors hover:bg-muted"
            >
              Já tenho conta
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 text-sm text-muted-foreground sm:flex-row">
          <p>© {new Date().getFullYear()} Time Flow</p>
          <div className="flex gap-6">
            <a href="#" className="transition-colors hover:text-foreground">
              Termos
            </a>
            <a href="#" className="transition-colors hover:text-foreground">
              Privacidade
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
