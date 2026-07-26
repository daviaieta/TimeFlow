# Vitrine Pública do Negócio — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar a cada negócio uma página de apresentação em `/[slug]` — banner, identidade, serviços e equipe — que antecede o assistente de agendamento, movido para `/[slug]/agendar`.

**Architecture:** Nenhuma mudança de schema ou de servidor. A página consome a resposta que `GET /public/businesses/:slug` já devolve, e a identidade visual ausente é gerada: gradiente derivado do hash do slug, monograma de iniciais para a logo, avatares de iniciais para a equipe. Os componentes de imagem nascem aceitando `src?: string | null` para que a Fase 2, ao trazer `logoUrl`/`bannerUrl`, seja troca de prop e não redesenho. A vitrine é server component com `generateMetadata`; o assistente segue client-side como está hoje.

**Tech Stack:** Next.js 16.2.11 (App Router), React 19, TypeScript, Tailwind CSS 4, Base UI / shadcn, hugeicons.

## Global Constraints

- Comentários e mensagens de commit em português; código e identificadores em inglês.
- Commits no formato `tipo(escopo): descrição no imperativo em inglês`, como o histórico (`feat(web):`, `fix(web):`, `docs:`).
- **Next.js 16 — diferenças que quebram conhecimento prévio, confirmadas em `web/node_modules/next/dist/docs/`:**
  - `params` e `searchParams` são `Promise` e exigem `await`.
  - `fetch` sem opção de cache é prerenderizado durante o `next build`. Toda chamada que precisa de dado fresco declara `cache: "no-store"`.
  - `notFound()` vem de `next/navigation` e não precisa de `return`.
- Os testes do `web/` rodam TypeScript nativo (`node --test lib/*.test.ts`), sem transpilador. Imports relativos **exigem a extensão `.ts` explícita** e tipos usam `type` inline — siga `web/lib/publicBooking.test.ts`.
- Mobile-first: estilo base vale para o celular, `sm:`/`lg:` só ampliam.
- Rode `npm test` e `npm run typecheck` em `web/` antes de cada commit.
- Não invente campos que o `Business` não tem: nada de endereço, telefone ou horário de funcionamento.

---

## Estrutura de Arquivos

**Criados:**
- `web/lib/showcase.ts` — lógica pura da vitrine: gradiente por slug e inversão do mapa serviço→profissional.
- `web/lib/showcase.test.ts` — testes da lógica pura.
- `web/components/business-mark.tsx` — monograma do negócio sobre o gradiente; aceita `src` para o futuro.
- `web/components/team-avatar.tsx` — avatar de iniciais do colaborador; mesmo contrato.
- `web/app/[slug]/agendar/page.tsx` — o assistente, movido para cá.
- `web/app/[slug]/showcase-hero.tsx` — banner, identidade, CTA e selo de disponibilidade.
- `web/app/[slug]/services-section.tsx` — a lista de serviços.
- `web/app/[slug]/team-section.tsx` — a lista de profissionais.

**Modificados:**
- `web/app/[slug]/page.tsx` — deixa de montar o assistente e passa a ser a vitrine (server component).
- `web/adapters/fetchAdapter.ts` — aceita `cache`, necessário para o server component não servir dado do build.
- `web/app/[slug]/booking-wizard.tsx` — aceita serviço pré-selecionado.

---

### Task 1: Lógica pura da vitrine

Duas funções que o resto da vitrine consome. Ficam isoladas em `lib/` porque são a única parte com regra de verdade — o resto é composição de JSX.

**Files:**
- Create: `web/lib/showcase.ts`
- Create: `web/lib/showcase.test.ts`

**Interfaces:**
- Consumes: `PublicService` de `web/lib/publicBooking.ts`.
- Produces: `businessGradient(slug: string): BusinessGradient` onde `BusinessGradient = { from: string; to: string }`; `servicesByEmployee(services: PublicService[]): Map<number, string[]>`. A Task 2 usa `businessGradient`; a Task 6 usa `servicesByEmployee`.

- [ ] **Step 1: Escrever o teste que falha**

`web/lib/showcase.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { businessGradient, servicesByEmployee } from "./showcase.ts";
import { type PublicService } from "./publicBooking.ts";

test("o mesmo slug devolve sempre o mesmo gradiente", () => {
  assert.deepEqual(
    businessGradient("barbearia-old-brothers"),
    businessGradient("barbearia-old-brothers"),
  );
});

test("slugs diferentes recebem cores diferentes", () => {
  const um = businessGradient("barbearia-old-brothers");
  const outro = businessGradient("studio-bella");

  assert.notEqual(um.from, outro.from);
});

test("o gradiente sai em HSL válido", () => {
  const { from, to } = businessGradient("qualquer-coisa");

  assert.match(from, /^hsl\(\d{1,3} \d{1,3}% \d{1,3}%\)$/);
  assert.match(to, /^hsl\(\d{1,3} \d{1,3}% \d{1,3}%\)$/);
});

test("slug vazio não quebra o gradiente", () => {
  const { from } = businessGradient("");

  assert.match(from, /^hsl\(/);
});

function service(
  id: number,
  name: string,
  employees: { id: number; name: string }[],
): PublicService {
  return {
    id,
    name,
    duration: 30,
    price: "45.00",
    employees: employees.map((employee) => ({ ...employee, nextSlot: null })),
  };
}

test("cada profissional lista os serviços que atende", () => {
  const map = servicesByEmployee([
    service(1, "Corte", [{ id: 10, name: "Ana" }, { id: 11, name: "Bruno" }]),
    service(2, "Barba", [{ id: 11, name: "Bruno" }]),
  ]);

  assert.deepEqual(map.get(10), ["Corte"]);
  assert.deepEqual(map.get(11), ["Corte", "Barba"]);
});

test("profissional sem serviço não aparece no mapa", () => {
  const map = servicesByEmployee([service(1, "Corte", [{ id: 10, name: "Ana" }])]);

  assert.equal(map.has(99), false);
});

test("catálogo vazio devolve mapa vazio", () => {
  assert.equal(servicesByEmployee([]).size, 0);
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

```bash
cd web && npm test 2>&1 | tail -20
```

Esperado: FALHA — não encontra `./showcase.ts`.

- [ ] **Step 3: Implementar o mínimo**

`web/lib/showcase.ts`:

```ts
import { type PublicService } from "./publicBooking.ts";

export interface BusinessGradient {
  from: string;
  to: string;
}

// djb2: curto e espalha bem. O importante é ser estável — o mesmo negócio
// precisa ter sempre a mesma cara, e dois negócios precisam se distinguir.
function hashSlug(slug: string): number {
  let value = 5381;

  for (let index = 0; index < slug.length; index += 1) {
    value = (value * 33) ^ slug.charCodeAt(index);
  }

  return Math.abs(value);
}

// Nenhum negócio tem banner cadastrado ainda. Em vez de um bloco cinza, cada
// slug ganha seu próprio par de cores, derivado dele mesmo.
export function businessGradient(slug: string): BusinessGradient {
  const hue = hashSlug(slug) % 360;
  // 40° na roda de cores: perto o bastante para o gradiente ler como uma cor
  // só, longe o bastante para não virar um bloco chapado.
  const partner = (hue + 40) % 360;

  return {
    from: `hsl(${hue} 62% 42%)`,
    to: `hsl(${partner} 68% 28%)`,
  };
}

// A API entrega serviço → profissionais. A seção de equipe precisa do inverso,
// e inverter aqui evita um request a mais só para montar a lista.
export function servicesByEmployee(
  services: PublicService[],
): Map<number, string[]> {
  const byEmployee = new Map<number, string[]>();

  for (const service of services) {
    for (const employee of service.employees) {
      const owned = byEmployee.get(employee.id) ?? [];
      owned.push(service.name);
      byEmployee.set(employee.id, owned);
    }
  }

  return byEmployee;
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

```bash
cd web && npm test 2>&1 | grep -E "^. (pass|fail)"
```

Esperado: 51 passando (44 existentes + 7), 0 falhando.

- [ ] **Step 5: Verificar tipos**

```bash
cd web && npm run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add web/lib/showcase.ts web/lib/showcase.test.ts
git commit -m "feat(web): add pure helpers for the business showcase"
```

---

### Task 2: Monograma e avatar

Os dois lugares onde falta imagem. Nascem com `src?: string | null` para que a Fase 2 preencha sem redesenho — hoje o valor é sempre nulo e ambos caem nas iniciais.

`businessInitials` (em `lib/businessName.ts`) já serve para nome de pessoa: devolve as iniciais das duas primeiras palavras. Não duplique.

**Files:**
- Create: `web/components/business-mark.tsx`
- Create: `web/components/team-avatar.tsx`

**Interfaces:**
- Consumes: `businessGradient` (Task 1), `businessInitials` de `web/lib/businessName.ts`, `cn` de `web/lib/utils.ts`.
- Produces: `<BusinessMark name slug src? className? />` e `<TeamAvatar name src? className? />`. As Tasks 4, 5 e 6 usam ambos.

- [ ] **Step 1: Criar o monograma do negócio**

`web/components/business-mark.tsx`:

```tsx
import { businessGradient } from "@/lib/showcase";
import { businessInitials, formatBusinessName } from "@/lib/businessName";
import { cn } from "@/lib/utils";

interface BusinessMarkProps {
  name: string;
  slug: string;
  /** Reservado para a Fase 2, quando o negócio puder ter logo própria. */
  src?: string | null;
  className?: string;
}

export function BusinessMark({ name, slug, src, className }: BusinessMarkProps) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={src}
        alt={formatBusinessName(name)}
        className={cn("size-16 rounded-3xl object-cover", className)}
      />
    );
  }

  const { from, to } = businessGradient(slug);

  return (
    <span
      aria-hidden
      style={{ backgroundImage: `linear-gradient(135deg, ${from}, ${to})` }}
      className={cn(
        "flex size-16 items-center justify-center rounded-3xl text-xl font-semibold text-white shadow-lg ring-1 ring-white/15",
        className,
      )}
    >
      {businessInitials(name)}
    </span>
  );
}
```

- [ ] **Step 2: Criar o avatar do colaborador**

`web/components/team-avatar.tsx`:

```tsx
import { businessInitials } from "@/lib/businessName";
import { cn } from "@/lib/utils";

interface TeamAvatarProps {
  name: string;
  /** Reservado para a Fase 2, quando o colaborador puder ter foto. */
  src?: string | null;
  className?: string;
}

export function TeamAvatar({ name, src, className }: TeamAvatarProps) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={src}
        alt={name}
        className={cn("size-12 rounded-2xl object-cover", className)}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={cn(
        "flex size-12 items-center justify-center rounded-2xl bg-muted text-sm font-semibold text-muted-foreground",
        className,
      )}
    >
      {businessInitials(name)}
    </span>
  );
}
```

- [ ] **Step 3: Verificar tipos e lint**

```bash
cd web && npm run typecheck && npm run lint
```

Esperado: ambos limpos. Se o lint reclamar do `<img>`, o comentário de desativação acima da tag já cobre — confirme que ele está na linha imediatamente anterior.

- [ ] **Step 4: Commit**

```bash
git add web/components/business-mark.tsx web/components/team-avatar.tsx
git commit -m "feat(web): add business monogram and team avatar fallbacks"
```

---

### Task 3: Mover o assistente para /[slug]/agendar

Libera `/[slug]` para a vitrine. O comportamento do assistente não muda em nada — é uma mudança de endereço.

**Files:**
- Create: `web/app/[slug]/agendar/page.tsx`
- Modify: `web/app/[slug]/page.tsx`

**Interfaces:**
- Consumes: `BookingWizard` de `web/app/[slug]/booking-wizard.tsx`.
- Produces: a rota `/[slug]/agendar`. A Task 5 aponta o CTA para ela; a Task 7 acrescenta o parâmetro de serviço.

- [ ] **Step 1: Criar a página do assistente**

`web/app/[slug]/agendar/page.tsx`:

```tsx
"use client";

import { useParams } from "next/navigation";
import { BookingWizard } from "../booking-wizard";

export default function BookingPage() {
  const params = useParams<{ slug: string }>();

  return <BookingWizard slug={params.slug} />;
}
```

- [ ] **Step 2: Deixar a vitrine como marcador temporário**

A Task 4 escreve a vitrine de verdade. Por ora, substitua `web/app/[slug]/page.tsx` para a rota não ficar quebrada entre commits:

```tsx
export default function BusinessShowcasePage() {
  return null;
}
```

- [ ] **Step 3: Verificar o assistente no endereço novo**

```bash
cd web && npm run dev
```

Com a API rodando (`cd server && npm run dev`) e um negócio cadastrado, abra `http://localhost:3000/<slug>/agendar`. Esperado: o assistente carrega no passo 1 e o fluxo completo continua funcionando até a confirmação. Abrir `http://localhost:3000/<slug>` deve mostrar uma página em branco — é o marcador do Step 2.

- [ ] **Step 4: Verificar build e tipos**

```bash
cd web && npm run typecheck && npm run build
```

- [ ] **Step 5: Commit**

```bash
git add web/app/[slug]/agendar/page.tsx web/app/[slug]/page.tsx
git commit -m "refactor(web): move the booking wizard to /[slug]/agendar"
```

---

### Task 4: A vitrine carrega os dados e apresenta o negócio

O esqueleto da página: server component que busca o catálogo, trata negócio inexistente, gera metadata e renderiza o banner com identidade e CTA. As seções de serviço e equipe entram nas Tasks 5 e 6.

**Files:**
- Modify: `web/adapters/fetchAdapter.ts`
- Modify: `web/app/[slug]/page.tsx`
- Create: `web/app/[slug]/showcase-hero.tsx`

**Interfaces:**
- Consumes: `BusinessMark` (Task 2), `earliestNextSlot`/`nextSlotLabel`/`PublicBusiness` de `web/lib/publicBooking.ts`, `formatBusinessName` de `web/lib/businessName.ts`.
- Produces: `loadCatalog(slug: string): Promise<PublicBusiness | null>` exportado de `web/app/[slug]/page.tsx`; `<ShowcaseHero catalog todayKey />`. As Tasks 5 e 6 recebem `catalog` da mesma chamada.

- [ ] **Step 1: Permitir controle de cache no adapter**

Sem isto o `fetch` do server component é resolvido durante o `next build` e a página serviria "próximo horário" congelado. Em `web/adapters/fetchAdapter.ts`, acrescente o campo à interface de entrada:

```ts
interface FetchAdapterInput {
  method: HttpMethod;
  path: string;
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
  /** Server components precisam declarar: sem isto o Next resolve no build. */
  cache?: RequestCache;
}
```

Adicione `cache` ao destructuring da função e repasse ao `fetch`:

```ts
export const fetchAdapter = async <T = unknown>({
  method,
  path,
  body,
  headers,
  cache,
}: FetchAdapterInput): Promise<FetchAdapterResponse<T>> => {
  const token = typeof window === "undefined" ? null : getToken();

  const res = await fetch(`${API_URL}${path}`, {
    method,
    cache,
    headers: {
```

O resto da função fica intacto.

- [ ] **Step 2: Escrever a vitrine**

Substitua `web/app/[slug]/page.tsx` inteiro:

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchAdapter } from "@/adapters/fetchAdapter";
import { formatBusinessName } from "@/lib/businessName";
import { type PublicBusiness } from "@/lib/publicBooking";
import { ShowcaseHero } from "./showcase-hero";

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

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
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

  return (
    <div className="min-h-dvh bg-background">
      <ShowcaseHero catalog={catalog} todayKey={todayKey()} />
    </div>
  );
}
```

- [ ] **Step 3: Escrever o banner**

`web/app/[slug]/showcase-hero.tsx`:

```tsx
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight02Icon, Clock01Icon } from "@hugeicons/core-free-icons";
import { BusinessMark } from "@/components/business-mark";
import { Button } from "@/components/ui/button";
import { formatBusinessName } from "@/lib/businessName";
import {
  type PublicBusiness,
  earliestNextSlot,
  nextSlotLabel,
} from "@/lib/publicBooking";
import { businessGradient } from "@/lib/showcase";

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
    <header className="relative">
      <div
        aria-hidden
        style={{ backgroundImage: `linear-gradient(135deg, ${from}, ${to})` }}
        className="h-40 w-full sm:h-56 lg:h-72"
      />

      <div className="mx-auto -mt-10 w-full max-w-4xl px-5 pb-10 sm:px-8 sm:-mt-12">
        <BusinessMark
          name={catalog.business.name}
          slug={slug}
          className="size-20 sm:size-24"
        />

        <h1 className="mt-5 text-[30px] font-semibold leading-[1.08] tracking-[-0.025em] sm:text-[44px]">
          {name}
        </h1>

        {next && (
          <p className="mt-3 inline-flex items-center gap-1.5 text-[15px] text-muted-foreground">
            <HugeiconsIcon icon={Clock01Icon} className="size-4" />
            Próximo horário: {nextSlotLabel(next, todayKey)}
          </p>
        )}

        {hasServices && (
          <div className="mt-7">
            <Button size="lg" className="h-12 w-full rounded-2xl text-[15px] sm:w-auto sm:px-8" asChild>
              <Link href={`/${slug}/agendar`}>
                Agendar horário
                <HugeiconsIcon icon={ArrowRight02Icon} data-icon="inline-end" />
              </Link>
            </Button>
            <p className={`${EYEBROW} mt-4 text-muted-foreground`}>
              Sem criar conta · leva menos de um minuto
            </p>
          </div>
        )}
      </div>
    </header>
  );
}
```

- [ ] **Step 4: Confirmar que o Button aceita asChild**

```bash
cd web && grep -n "asChild" components/ui/button.tsx
```

Esperado: a prop existe. Se **não** existir, troque o `<Button asChild>` por um `<Link>` estilizado com as mesmas classes do botão — não invente a prop.

- [ ] **Step 5: Verificar no navegador**

Com API e web rodando, abra `http://localhost:3000/<slug>`. Esperado: banner colorido, monograma com as iniciais do negócio, nome, o selo de próximo horário e o botão levando a `/<slug>/agendar`.

Abra também `http://localhost:3000/negocio-inexistente`. Esperado: a página 404 do Next, não um erro de runtime.

Confira o título da aba: deve ser `<Nome> — agende seu horário`.

- [ ] **Step 6: Verificar largura mínima no celular**

No DevTools, largura 360px. Esperado: nada de scroll horizontal, o botão ocupa a largura toda, o nome não estoura.

- [ ] **Step 7: Verificar tipos, testes e build**

```bash
cd web && npm run typecheck && npm test && npm run build
```

- [ ] **Step 8: Commit**

```bash
git add web/adapters/fetchAdapter.ts web/app/[slug]/page.tsx web/app/[slug]/showcase-hero.tsx
git commit -m "feat(web): add the public business showcase page"
```

---

### Task 5: Seção de serviços

Todos os serviços, cada um com seu caminho direto para o agendamento.

**Files:**
- Create: `web/app/[slug]/services-section.tsx`
- Modify: `web/app/[slug]/page.tsx`

**Interfaces:**
- Consumes: `catalog` (Task 4), `formatPrice` de `web/lib/publicBooking.ts`, `formatMinutes` de `web/lib/schedule.ts`.
- Produces: `<ServicesSection catalog />`. O link de cada card leva a `/[slug]/agendar?servico=<id>`, que a Task 7 passa a honrar.

- [ ] **Step 1: Escrever a seção**

`web/app/[slug]/services-section.tsx`:

```tsx
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
    <section className="mx-auto w-full max-w-4xl px-5 py-10 sm:px-8">
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
                  {formatMinutes(service.duration)} · {formatPrice(service.price)}
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
```

- [ ] **Step 2: Montar a seção na página**

Em `web/app/[slug]/page.tsx`, acrescente o import:

```tsx
import { ServicesSection } from "./services-section";
```

E o componente logo abaixo do `<ShowcaseHero />`:

```tsx
      <ServicesSection catalog={catalog} />
```

- [ ] **Step 3: Confirmar a assinatura de formatMinutes**

```bash
cd web && grep -n "export function formatMinutes" -A6 lib/schedule.ts
```

Esperado: recebe minutos e devolve string legível. Se a assinatura for outra, ajuste a chamada — não presuma.

- [ ] **Step 4: Verificar no navegador**

Abra `http://localhost:3000/<slug>`. Esperado: todos os serviços cadastrados aparecem com duração e preço, em uma coluna no celular e duas a partir de `sm`. Clicar num card leva a `/<slug>/agendar?servico=<id>` — por ora o assistente ignora o parâmetro e abre no passo 1, o que a Task 7 corrige.

Com um negócio sem serviços, a seção some inteira e o CTA do banner também.

- [ ] **Step 5: Verificar tipos, testes e build**

```bash
cd web && npm run typecheck && npm test && npm run build
```

- [ ] **Step 6: Commit**

```bash
git add web/app/[slug]/services-section.tsx web/app/[slug]/page.tsx
git commit -m "feat(web): list the business services on the showcase"
```

---

### Task 6: Seção de equipe e rodapé

Quem atende, o que cada um faz e quando tem vaga. O rodapé fecha a página com a marca da plataforma.

**Files:**
- Create: `web/app/[slug]/team-section.tsx`
- Modify: `web/app/[slug]/page.tsx`

**Interfaces:**
- Consumes: `catalog` (Task 4), `TeamAvatar` (Task 2), `servicesByEmployee` (Task 1), `nextSlotLabel` de `web/lib/publicBooking.ts`, `Logo` de `web/components/logo.tsx`.
- Produces: `<TeamSection catalog todayKey />`.

- [ ] **Step 1: Escrever a seção**

`web/app/[slug]/team-section.tsx`:

```tsx
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
    <section className="mx-auto w-full max-w-4xl px-5 pb-10 sm:px-8">
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
                    Próximo horário: {nextSlotLabel(professional.nextSlot, todayKey)}
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
```

- [ ] **Step 2: Montar a seção e o rodapé na página**

Em `web/app/[slug]/page.tsx`, acrescente os imports:

```tsx
import Link from "next/link";
import { Logo } from "@/components/logo";
import { TeamSection } from "./team-section";
```

E, dentro do `<div>`, abaixo de `<ServicesSection />`:

```tsx
      <TeamSection catalog={catalog} todayKey={today} />

      <footer className="border-t">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-4 px-5 py-8 sm:px-8">
          <Link href="/" className="opacity-70 transition-opacity hover:opacity-100">
            <Logo markClassName="size-6" />
          </Link>
          <p className="text-xs text-muted-foreground">Agendamento online</p>
        </div>
      </footer>
```

`today` exige extrair a chamada para uma constante no corpo do componente, já que agora dois filhos a usam:

```tsx
  const today = todayKey();
```

E o `<ShowcaseHero />` passa a receber `todayKey={today}`.

- [ ] **Step 3: Verificar no navegador**

Abra `http://localhost:3000/<slug>`. Esperado: cada profissional com iniciais, nome, a lista dos serviços que atende e o próximo horário livre dele. Um profissional sem vínculo com serviço aparece sem a linha de serviços, e sem agenda aberta aparece sem a linha de horário — nenhum dos dois some da lista.

O rodapé mostra a marca Time Flow e leva à landing.

- [ ] **Step 4: Verificar largura mínima no celular**

DevTools em 360px: sem scroll horizontal, nomes longos truncam em vez de estourar.

- [ ] **Step 5: Verificar tipos, testes e build**

```bash
cd web && npm run typecheck && npm test && npm run build
```

- [ ] **Step 6: Commit**

```bash
git add web/app/[slug]/team-section.tsx web/app/[slug]/page.tsx
git commit -m "feat(web): show the team and footer on the showcase"
```

---

### Task 7: Deep link do serviço no assistente

Fecha o circuito: clicar num serviço na vitrine abre o assistente com ele já escolhido, no passo 2.

**Files:**
- Modify: `web/app/[slug]/agendar/page.tsx`
- Modify: `web/app/[slug]/booking-wizard.tsx`

**Interfaces:**
- Consumes: `BookingWizard` (existente), a rota da Task 3, os links da Task 5.
- Produces: `<BookingWizard slug initialServiceId? />`.

- [ ] **Step 1: Ler como o assistente guarda o passo e o serviço**

```bash
cd web && grep -n "useState\|step\|service" "app/[slug]/booking-wizard.tsx" | head -40
```

Anote o nome exato do estado do serviço selecionado e do passo. Os Steps 3 e 4 dependem disso — **não presuma os nomes**.

- [ ] **Step 2: Passar o parâmetro da URL**

`web/app/[slug]/agendar/page.tsx`:

```tsx
"use client";

import { useParams, useSearchParams } from "next/navigation";
import { BookingWizard } from "../booking-wizard";

export default function BookingPage() {
  const params = useParams<{ slug: string }>();
  const search = useSearchParams();
  const requested = Number(search.get("servico"));

  return (
    <BookingWizard
      slug={params.slug}
      initialServiceId={Number.isInteger(requested) && requested > 0 ? requested : undefined}
    />
  );
}
```

- [ ] **Step 3: Aceitar o serviço inicial no assistente**

Em `web/app/[slug]/booking-wizard.tsx`, acrescente a prop opcional à interface de props do componente:

```tsx
  /** Vem da vitrine: o cliente já escolheu o serviço e pula o passo 1. */
  initialServiceId?: number;
```

E receba `initialServiceId` no destructuring do componente.

- [ ] **Step 4: Aplicar quando o catálogo chegar**

O catálogo é carregado de forma assíncrona, então o serviço só pode ser pré-selecionado depois que ele existe. Junto do efeito que hoje carrega o catálogo, aplique uma vez:

```tsx
  // A vitrine deep-linka com ?servico=<id>. O passo 1 só é pulado se o id
  // corresponder a um serviço real deste negócio — link velho ou adulterado
  // cai no fluxo normal em vez de quebrar.
  useEffect(() => {
    if (!catalog || initialServiceId === undefined) return;

    const requested = catalog.services.find(
      (service) => service.id === initialServiceId,
    );
    if (!requested) return;

    setSelectedService(requested);
    setStep(2);
  }, [catalog, initialServiceId]);
```

Ajuste `setSelectedService`, `setStep` e `catalog` para os nomes reais anotados no Step 1.

- [ ] **Step 5: Verificar o caminho feliz**

Abra a vitrine e clique num card de serviço. Esperado: o assistente abre no passo 2 (escolha de profissional) com o serviço já selecionado no resumo, e o botão Voltar leva ao passo 1 com aquele serviço marcado.

- [ ] **Step 6: Verificar os caminhos torto**

- `http://localhost:3000/<slug>/agendar?servico=99999` — id inexistente: abre no passo 1 normalmente, sem erro.
- `http://localhost:3000/<slug>/agendar?servico=abc` — não numérico: abre no passo 1 normalmente.
- `http://localhost:3000/<slug>/agendar` — sem parâmetro: comportamento de hoje, inalterado.

- [ ] **Step 7: Verificar tipos, testes e build**

```bash
cd web && npm run typecheck && npm test && npm run build
```

- [ ] **Step 8: Commit**

```bash
git add "web/app/[slug]/agendar/page.tsx" "web/app/[slug]/booking-wizard.tsx"
git commit -m "feat(web): preselect the service when arriving from the showcase"
```

---

## Self-Review

**Cobertura do spec:** rotas e deep link (Tasks 3, 5, 7); banner, identidade, CTA e selo de disponibilidade (Task 4); serviços (Task 5); equipe e rodapé (Task 6); fallbacks visuais (Tasks 1, 2); `generateMetadata` e `notFound` (Task 4); estados vazios — sem serviços (Task 5, Step 4), sem horários livres (Tasks 4 e 6, condicionais de `nextSlot`), negócio inexistente (Task 4, Step 5).

**Fora do escopo, conforme o spec:** qualquer mudança de schema, de servidor, ou campos de endereço, telefone e horário de funcionamento.

**Consistência de tipos:** `businessGradient(slug): BusinessGradient` (Task 1) é consumido na Task 2 e na Task 4. `servicesByEmployee(services): Map<number, string[]>` (Task 1) é consumido na Task 6. `<BusinessMark name slug src? className? />` e `<TeamAvatar name src? className? />` (Task 2) são consumidos nas Tasks 4 e 6. `loadCatalog(slug): Promise<PublicBusiness | null>` e o `todayKey` (Task 4) alimentam as Tasks 5 e 6. `initialServiceId?: number` (Task 7) é a única mudança de contrato do assistente.

**Verificações que dependem de leitura, não de suposição:** a prop `asChild` do `Button` (Task 4, Step 4), a assinatura de `formatMinutes` (Task 5, Step 3) e os nomes de estado do assistente (Task 7, Step 1). Cada uma tem um passo dedicado de conferência antes do uso.

**Contagem de testes esperada:** 44 → 51 na Task 1, estável daí em diante — as Tasks 2 a 7 são composição de JSX, verificada no navegador e pelo build.
