import Link from "next/link";

const features = [
  {
    title: "Agenda inteligente",
    description:
      "Visualize todos os seus horários em um só lugar. Bloqueie períodos, defina intervalos e evite conflitos automaticamente.",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        className="h-6 w-6"
      >
        <rect x="3" y="4" width="18" height="17" rx="2" />
        <path d="M3 9h18M8 2v4M16 2v4M8 14h3M8 17h6" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: "Agendamento online 24/7",
    description:
      "Seus clientes agendam sozinhos pela sua página exclusiva, a qualquer hora, sem trocar mensagens.",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        className="h-6 w-6"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: "Lembretes automáticos",
    description:
      "Reduza faltas com confirmações e lembretes enviados automaticamente antes de cada atendimento.",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        className="h-6 w-6"
      >
        <path
          d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M10.3 21a2 2 0 003.4 0"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    title: "Gestão de clientes",
    description:
      "Histórico completo de atendimentos, preferências e contatos de cada cliente ao alcance de um clique.",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        className="h-6 w-6"
      >
        <circle cx="9" cy="8" r="3.5" />
        <path
          d="M2.5 20a6.5 6.5 0 0113 0M16 4.5a3.5 3.5 0 010 7M21.5 20a6.5 6.5 0 00-4.5-6.2"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    title: "Pagamentos integrados",
    description:
      "Receba antecipado ou no ato. Pix, cartão e boleto direto na hora do agendamento.",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        className="h-6 w-6"
      >
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <path d="M2 10h20M6 15h4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: "Relatórios e métricas",
    description:
      "Acompanhe faturamento, ocupação da agenda e serviços mais procurados em painéis simples.",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        className="h-6 w-6"
      >
        <path
          d="M4 20V10M10 20V4M16 20v-8M21 20H3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
];

const steps = [
  {
    number: "1",
    title: "Crie sua conta",
    description:
      "Cadastre seu negócio, serviços, preços e horários de atendimento em poucos minutos.",
  },
  {
    number: "2",
    title: "Compartilhe seu link",
    description:
      "Divulgue sua página de agendamento no Instagram, WhatsApp ou onde seus clientes estiverem.",
  },
  {
    number: "3",
    title: "Receba agendamentos",
    description:
      "Os clientes escolhem o horário, você recebe a confirmação e a agenda se organiza sozinha.",
  },
];

const plans = [
  {
    name: "Grátis",
    price: "R$ 0",
    period: "/mês",
    description: "Para quem está começando",
    features: [
      "Até 30 agendamentos/mês",
      "1 profissional",
      "Página de agendamento",
      "Lembretes por e-mail",
    ],
    highlighted: false,
    cta: "Começar grátis",
  },
  {
    name: "Profissional",
    price: "R$ 49",
    period: "/mês",
    description: "Para negócios em crescimento",
    features: [
      "Agendamentos ilimitados",
      "Até 5 profissionais",
      "Lembretes por WhatsApp",
      "Pagamentos online",
      "Relatórios completos",
    ],
    highlighted: true,
    cta: "Testar 14 dias grátis",
  },
  {
    name: "Equipe",
    price: "R$ 99",
    period: "/mês",
    description: "Para equipes e franquias",
    features: [
      "Tudo do Profissional",
      "Profissionais ilimitados",
      "Múltiplas unidades",
      "Permissões por função",
      "Suporte prioritário",
    ],
    highlighted: false,
    cta: "Falar com vendas",
  },
];

const testimonials = [
  {
    quote:
      "Antes eu perdia horas respondendo mensagens para marcar horário. Agora a agenda se preenche sozinha e as faltas caíram pela metade.",
    name: "Mariana Costa",
    role: "Studio de beleza · São Paulo",
  },
  {
    quote:
      "Meus pacientes adoram poder remarcar sozinhos. Eu ganhei tempo e a recepção ficou muito mais tranquila.",
    name: "Dr. Rafael Lima",
    role: "Clínica odontológica · Curitiba",
  },
  {
    quote:
      "Em três meses o faturamento subiu 30% só porque paramos de perder horários vagos. A visão da agenda é impecável.",
    name: "Juliana Alves",
    role: "Barbearia · Belo Horizonte",
  },
];

function Logo() {
  return (
    <span className="flex items-center gap-2 font-semibold tracking-tight">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="h-4.5 w-4.5"
        >
          <rect x="3" y="4" width="18" height="17" rx="3" />
          <path
            d="M8 2v4M16 2v4M8.5 14.5l2.5 2.5 4.5-5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span className="text-lg">Bookly</span>
    </span>
  );
}

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-zinc-200/70 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Logo />
          <nav className="hidden items-center gap-8 text-sm text-zinc-600 md:flex dark:text-zinc-400">
            <Link
              href="#recursos"
              className="transition-colors hover:text-zinc-900 dark:hover:text-white"
            >
              Recursos
            </Link>
            <Link
              href="#como-funciona"
              className="transition-colors hover:text-zinc-900 dark:hover:text-white"
            >
              Como funciona
            </Link>
            <Link
              href="#precos"
              className="transition-colors hover:text-zinc-900 dark:hover:text-white"
            >
              Preços
            </Link>
            <Link
              href="#depoimentos"
              className="transition-colors hover:text-zinc-900 dark:hover:text-white"
            >
              Depoimentos
            </Link>
          </nav>
          <div className="flex items-center gap-3">
            <Link
              href="#"
              className="hidden text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-900 sm:block dark:text-zinc-400 dark:hover:text-white"
            >
              Entrar
            </Link>
            <Link
              href="#"
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500"
            >
              Começar grátis
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-[32rem] bg-gradient-to-b from-emerald-50 to-transparent dark:from-emerald-950/30"
          />
          <div className="relative mx-auto max-w-6xl px-6 pt-20 pb-24 text-center sm:pt-28">
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Novo: lembretes por WhatsApp
            </span>
            <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-bold tracking-tight text-balance sm:text-6xl">
              Sua agenda cheia, sem esforço
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-zinc-600 text-pretty dark:text-zinc-400">
              O Bookly automatiza seus agendamentos do início ao fim: seus
              clientes marcam online, recebem lembretes e você foca no que
              importa — atender bem.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link
                href="#"
                className="w-full rounded-lg bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-500 sm:w-auto"
              >
                Criar conta grátis
              </Link>
              <Link
                href="#como-funciona"
                className="w-full rounded-lg border border-zinc-300 px-6 py-3 text-sm font-semibold transition-colors hover:bg-zinc-50 sm:w-auto dark:border-zinc-700 dark:hover:bg-zinc-900"
              >
                Ver como funciona
              </Link>
            </div>
            <p className="mt-4 text-xs text-zinc-500">
              Sem cartão de crédito · Cancele quando quiser
            </p>

            {/* Mock preview */}
            <div className="mx-auto mt-16 max-w-4xl rounded-2xl border border-zinc-200 bg-white p-2 shadow-xl shadow-zinc-900/5 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="rounded-xl bg-zinc-50 p-6 dark:bg-zinc-950">
                <div className="flex items-center justify-between">
                  <div className="text-left">
                    <p className="text-sm font-semibold">Agenda de hoje</p>
                    <p className="text-xs text-zinc-500">
                      Terça-feira, 14 de julho
                    </p>
                  </div>
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                    8 agendamentos
                  </span>
                </div>
                <div className="mt-4 space-y-2">
                  {[
                    {
                      time: "09:00",
                      client: "Ana Souza",
                      service: "Corte e escova",
                      status: "Confirmado",
                    },
                    {
                      time: "10:30",
                      client: "Pedro Martins",
                      service: "Barba e cabelo",
                      status: "Confirmado",
                    },
                    {
                      time: "13:00",
                      client: "Carla Dias",
                      service: "Coloração",
                      status: "Aguardando",
                    },
                    {
                      time: "15:30",
                      client: "Lucas Ferreira",
                      service: "Corte masculino",
                      status: "Confirmado",
                    },
                  ].map((slot) => (
                    <div
                      key={slot.time}
                      className="flex items-center gap-4 rounded-lg border border-zinc-200 bg-white px-4 py-3 text-left dark:border-zinc-800 dark:bg-zinc-900"
                    >
                      <span className="w-12 text-sm font-semibold tabular-nums">
                        {slot.time}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {slot.client}
                        </p>
                        <p className="truncate text-xs text-zinc-500">
                          {slot.service}
                        </p>
                      </div>
                      <span
                        className={
                          slot.status === "Confirmado"
                            ? "rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
                            : "rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-400"
                        }
                      >
                        {slot.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Social proof */}
        <section className="border-y border-zinc-200 bg-zinc-50 py-10 dark:border-zinc-800 dark:bg-zinc-900/50">
          <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 px-6 text-center sm:grid-cols-4">
            {[
              { value: "12 mil+", label: "profissionais ativos" },
              { value: "1,8 mi", label: "agendamentos por mês" },
              { value: "-47%", label: "de faltas em média" },
              { value: "4,9/5", label: "avaliação dos clientes" },
            ].map((stat) => (
              <div key={stat.label}>
                <p className="text-3xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
                  {stat.value}
                </p>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Features */}
        <section
          id="recursos"
          className="mx-auto max-w-6xl scroll-mt-20 px-6 py-24"
        >
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
              Tudo que seu negócio precisa para nunca mais perder um horário
            </h2>
            <p className="mt-4 text-lg text-zinc-600 dark:text-zinc-400">
              Ferramentas pensadas para salões, clínicas, barbearias, estúdios e
              qualquer negócio que viva de agenda.
            </p>
          </div>
          <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="rounded-2xl border border-zinc-200 p-6 transition-shadow hover:shadow-md dark:border-zinc-800 dark:hover:shadow-zinc-900"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
                  {feature.icon}
                </div>
                <h3 className="mt-4 font-semibold">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section
          id="como-funciona"
          className="scroll-mt-20 border-y border-zinc-200 bg-zinc-50 py-24 dark:border-zinc-800 dark:bg-zinc-900/50"
        >
          <div className="mx-auto max-w-6xl px-6">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
                Comece a receber agendamentos hoje
              </h2>
              <p className="mt-4 text-lg text-zinc-600 dark:text-zinc-400">
                Três passos simples entre você e uma agenda organizada.
              </p>
            </div>
            <div className="mt-16 grid gap-10 sm:grid-cols-3">
              {steps.map((step) => (
                <div key={step.number} className="text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-600 text-lg font-bold text-white">
                    {step.number}
                  </div>
                  <h3 className="mt-5 font-semibold">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                    {step.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section
          id="precos"
          className="mx-auto max-w-6xl scroll-mt-20 px-6 py-24"
        >
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
              Planos que cabem no seu bolso
            </h2>
            <p className="mt-4 text-lg text-zinc-600 dark:text-zinc-400">
              Comece grátis e evolua conforme seu negócio cresce. Sem taxas
              escondidas.
            </p>
          </div>
          <div className="mt-16 grid gap-8 lg:grid-cols-3">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={
                  plan.highlighted
                    ? "relative rounded-2xl border-2 border-emerald-600 p-8 shadow-lg shadow-emerald-600/10"
                    : "rounded-2xl border border-zinc-200 p-8 dark:border-zinc-800"
                }
              >
                {plan.highlighted && (
                  <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white">
                    Mais popular
                  </span>
                )}
                <h3 className="font-semibold">{plan.name}</h3>
                <p className="mt-1 text-sm text-zinc-500">{plan.description}</p>
                <p className="mt-6">
                  <span className="text-4xl font-bold tracking-tight">
                    {plan.price}
                  </span>
                  <span className="text-sm text-zinc-500">{plan.period}</span>
                </p>
                <ul className="mt-8 space-y-3 text-sm">
                  {plan.features.map((item) => (
                    <li key={item} className="flex items-start gap-3">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                      >
                        <path
                          d="M4 12.5l5 5L20 6.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      <span className="text-zinc-700 dark:text-zinc-300">
                        {item}
                      </span>
                    </li>
                  ))}
                </ul>
                <Link
                  href="#"
                  className={
                    plan.highlighted
                      ? "mt-8 block rounded-lg bg-emerald-600 px-4 py-2.5 text-center text-sm font-semibold text-white transition-colors hover:bg-emerald-500"
                      : "mt-8 block rounded-lg border border-zinc-300 px-4 py-2.5 text-center text-sm font-semibold transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
                  }
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
        </section>

        {/* Testimonials */}
        <section
          id="depoimentos"
          className="scroll-mt-20 border-y border-zinc-200 bg-zinc-50 py-24 dark:border-zinc-800 dark:bg-zinc-900/50"
        >
          <div className="mx-auto max-w-6xl px-6">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
                Quem usa, não volta para a agenda de papel
              </h2>
            </div>
            <div className="mt-16 grid gap-8 lg:grid-cols-3">
              {testimonials.map((testimonial) => (
                <figure
                  key={testimonial.name}
                  className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <div
                    className="flex gap-1 text-amber-400"
                    aria-label="5 estrelas"
                  >
                    {Array.from({ length: 5 }).map((_, i) => (
                      <svg
                        key={i}
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        className="h-4 w-4"
                      >
                        <path d="M10 1.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8L10 14.9l-5.3 2.7 1-5.8L1.5 7.7l5.9-.9L10 1.5z" />
                      </svg>
                    ))}
                  </div>
                  <blockquote className="mt-4 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                    “{testimonial.quote}”
                  </blockquote>
                  <figcaption className="mt-5">
                    <p className="text-sm font-semibold">{testimonial.name}</p>
                    <p className="text-xs text-zinc-500">{testimonial.role}</p>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="mx-auto max-w-6xl px-6 py-24">
          <div className="rounded-3xl bg-emerald-600 px-8 py-16 text-center text-white sm:px-16">
            <h2 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
              Pronto para lotar sua agenda?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-emerald-50">
              Crie sua conta gratuita em menos de 5 minutos e receba seu
              primeiro agendamento online ainda hoje.
            </p>
            <Link
              href="#"
              className="mt-8 inline-block rounded-lg bg-white px-8 py-3 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-50"
            >
              Começar agora — é grátis
            </Link>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-6 py-10 sm:flex-row">
          <Logo />
          <nav className="flex flex-wrap items-center justify-center gap-6 text-sm text-zinc-600 dark:text-zinc-400">
            <Link
              href="#"
              className="transition-colors hover:text-zinc-900 dark:hover:text-white"
            >
              Termos de uso
            </Link>
            <Link
              href="#"
              className="transition-colors hover:text-zinc-900 dark:hover:text-white"
            >
              Privacidade
            </Link>
            <Link
              href="#"
              className="transition-colors hover:text-zinc-900 dark:hover:text-white"
            >
              Contato
            </Link>
          </nav>
          <p className="text-sm text-zinc-500">
            © 2026 Bookly. Todos os direitos reservados.
          </p>
        </div>
      </footer>
    </div>
  );
}
