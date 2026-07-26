import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchAdapter } from "@/adapters/fetchAdapter";
import { Logo } from "@/components/logo";
import { formatBusinessName } from "@/lib/businessName";
import { type PublicBusiness } from "@/lib/publicBooking";
import { ServicesSection } from "./services-section";
import { ShowcaseHero } from "./showcase-hero";
import { TeamSection } from "./team-section";

interface PageProps {
  params: Promise<{ slug: string }>;
}

// No Next 16 o fetch sem cache declarado é resolvido no build. Esta página
// mostra o próximo horário livre: precisa ser buscada a cada visita.
async function loadCatalog(slug: string): Promise<PublicBusiness | null> {
  try {
    const { data } = await fetchAdapter<PublicBusiness>({
      method: "GET",
      path: `/public/businesses/${slug}`,
      cache: "no-store",
    });

    return data;
  } catch {
    return null;
  }
}

// A data de hoje precisa vir do render, não do módulo: um processo de longa
// duração congelaria "Hoje" no dia em que subiu.
function todayKey(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const catalog = await loadCatalog(slug);

  if (!catalog) {
    return { title: "Negócio não encontrado" };
  }

  const name = formatBusinessName(catalog.business.name);

  return {
    title: `${name} — agende seu horário`,
    description: `Veja os serviços e a equipe de ${name} e agende em menos de um minuto, sem criar conta.`,
  };
}

export default async function BusinessShowcasePage({ params }: PageProps) {
  const { slug } = await params;
  const catalog = await loadCatalog(slug);

  if (!catalog) {
    notFound();
  }

  const today = todayKey();

  return (
    <div className="min-h-dvh bg-background">
      <ShowcaseHero catalog={catalog} todayKey={today} />
      <ServicesSection catalog={catalog} />
      <TeamSection catalog={catalog} todayKey={today} />

      <footer className="border-t">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-4 px-5 py-8 sm:px-8">
          <Link
            href="/"
            className="opacity-70 transition-opacity hover:opacity-100"
          >
            <Logo markClassName="size-6" />
          </Link>
          <p className="text-xs text-muted-foreground">Agendamento online</p>
        </div>
      </footer>
    </div>
  );
}
