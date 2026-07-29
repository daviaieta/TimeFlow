import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Clock01Icon,
  Mail01Icon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons";
import { LandingHeader } from "../landing-header";
import { ContactForm } from "./contact-form";

export const metadata = {
  title: "Fale comigo — Time Flow",
  description:
    "Tire dúvidas sobre o Time Flow direto com quem construiu o produto. Resposta em até 1 dia útil.",
};

const promises = [
  {
    icon: Clock01Icon,
    title: "Resposta em até 1 dia útil",
    description:
      "Sem ticket, sem central de atendimento. Você escreve e eu respondo no seu e-mail.",
  },
  {
    icon: UserGroupIcon,
    title: "Configuração junto com você",
    description:
      "Se fizer sentido, monto seus serviços, sua equipe e sua agenda inicial com você na chamada.",
  },
  {
    icon: Mail01Icon,
    title: "Nada de lista de e-mails",
    description:
      "Seu e-mail serve para responder você. Não vira newsletter nem vai para lugar nenhum.",
  },
];

const faq = [
  {
    question: "Preciso já ter um negócio cadastrado?",
    answer:
      "Não. Se você ainda está avaliando, escreva mesmo assim — é o melhor momento para tirar dúvida de plano e de migração.",
  },
  {
    question: "Dá para migrar minha agenda atual?",
    answer:
      "Dá. Conte no formulário como você organiza hoje (papel, planilha, WhatsApp ou outro sistema) que eu digo o caminho mais curto.",
  },
  {
    question: "Quanto tempo leva para começar a receber reservas?",
    answer:
      "Com serviços e equipe cadastrados, a página pública fica no ar no mesmo dia.",
  },
];

export default function ContatoPage() {
  return (
    <div className="flex flex-1 flex-col">
      <LandingHeader />

      <section className="bg-gradient-to-b from-indigo-700 to-indigo-500 pb-20 dark:from-indigo-900 dark:to-indigo-800">
        <div className="mx-auto max-w-3xl px-6 pt-16 text-center sm:pt-24">
          <p className="text-sm font-medium text-indigo-100">Fale comigo</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            Sua agenda merece uma conversa de dez minutos
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-8 text-indigo-50/90">
            Me conte como você agenda hoje. Eu respondo dizendo, sem enrolação,
            se o Time Flow resolve o seu caso — e como seria começar.
          </p>
        </div>
      </section>

      <section className="mx-auto -mt-12 w-full max-w-6xl px-6 pb-24">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          <ContactForm />

          <div className="flex flex-col gap-6">
            <div className="rounded-2xl border bg-card p-6 shadow-sm">
              <h2 className="text-sm font-semibold text-foreground">
                O que acontece depois
              </h2>
              <ul className="mt-4 space-y-4">
                {promises.map((promise) => (
                  <li key={promise.title} className="flex gap-3">
                    <HugeiconsIcon
                      icon={promise.icon}
                      className="mt-0.5 size-5 shrink-0 text-primary"
                    />
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {promise.title}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        {promise.description}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border bg-card p-6 shadow-sm">
              <h2 className="text-sm font-semibold text-foreground">
                Perguntas frequentes
              </h2>
              <dl className="mt-4 space-y-4">
                {faq.map((item) => (
                  <div key={item.question}>
                    <dt className="text-sm font-medium text-foreground">
                      {item.question}
                    </dt>
                    <dd className="mt-1 text-xs leading-5 text-muted-foreground">
                      {item.answer}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="rounded-2xl bg-indigo-950 p-6 text-white">
              <p className="text-sm font-medium">Prefere ver antes de falar?</p>
              <p className="mt-1 text-xs leading-5 text-indigo-100">
                Os planos e o que cada um inclui estão na página inicial.
              </p>
              <Link
                href="/#precos"
                className="mt-4 inline-flex rounded-full bg-white px-4 py-2 text-xs font-medium text-indigo-950"
              >
                Ver planos
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
