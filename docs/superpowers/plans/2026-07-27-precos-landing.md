# Preços na landing page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A seção `#precos` de `web/app/page.tsx` mostra os 3 valores reais dos planos
(Essencial R$49,90, Profissional R$89,90, Equipe R$179,90), calculados a partir do custo
real de operação, em vez de "A definir".

**Architecture:** Troca de conteúdo estático — sem lógica nova, sem chamada de API. O
array `plans` já existente ganha dois campos (`price`, `priceSuffix`); o JSX que hoje
renderiza o texto fixo "A definir" passa a renderizar esses dois campos. O subtítulo da
seção troca a frase de "valores em definição" por uma nota de transparência sobre como o
preço foi calculado.

**Tech Stack:** Next.js 16 · React 19 · Tailwind (classes já usadas na página).

**Spec:** `docs/superpowers/specs/2026-07-27-precos-landing-design.md`

**Branch:** `feat/pricing-landing` (já criada, com o spec commitado).

## Global Constraints

- UI em português; sem comentário novo necessário — é troca de conteúdo estático, não há
  PORQUÊ não-óbvio a documentar.
- Web: `cd web && npm run typecheck`, `npm run lint`, `npm run build` — sem regressão (a
  única pendência de lint conhecida e pré-existente é `web/app/landing-header.tsx:19`).
- Sem teste automatizado novo — é conteúdo estático de marketing (ver spec, seção
  "Testes"). Verificação é visual: renderizar a página e conferir os 3 valores.

---

### Task 1: Substituir "A definir" pelos preços reais

**Files:**
- Modify: `web/app/page.tsx:51-85` (array `plans`)
- Modify: `web/app/page.tsx:249-256` (subtítulo da seção `#precos`)
- Modify: `web/app/page.tsx:274-283` (bloco de preço dentro do card)

**Interfaces:**
- Consumes: nada — array e JSX já existentes na própria task.
- Produces: nada consumido por outra task — esta é a única task do plano.

- [ ] **Step 1: Acrescentar `price` e `priceSuffix` ao array `plans`**

Em `web/app/page.tsx`, o array `plans` (linhas 51-85) hoje é:

```ts
const plans = [
  {
    name: "Essencial",
    description: "Para autônomos começando a organizar a agenda.",
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
    features: [
      "Profissionais ilimitados",
      "Tudo do Profissional",
      "Múltiplas unidades",
      "Onboarding dedicado",
    ],
    highlighted: false,
  },
];
```

Substitua pelo mesmo array com `price` e `priceSuffix` acrescentados a cada item:

```ts
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
```

- [ ] **Step 2: Trocar o subtítulo da seção pela nota de transparência**

No mesmo arquivo, dentro da seção `id="precos"` (por volta da linha 249-256), o bloco
hoje é:

```tsx
<div className="mx-auto max-w-xl text-center">
  <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
    Um plano para cada fase do seu negócio
  </h2>
  <p className="mt-3 text-muted-foreground">
    Os valores ainda estão sendo definidos e serão divulgados em
    breve.
  </p>
</div>
```

Troque só o texto do `<p>` (o `<h2>` e as classes ficam iguais):

```tsx
<div className="mx-auto max-w-xl text-center">
  <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
    Um plano para cada fase do seu negócio
  </h2>
  <p className="mt-3 text-muted-foreground">
    Preço calculado a partir do custo real de operação, com margem
    sustentável — sem surpresa depois.
  </p>
</div>
```

- [ ] **Step 3: Renderizar `price`/`priceSuffix` no lugar de "A definir"**

Ainda no mesmo arquivo, dentro do `.map((plan) => ...)` que desenha cada card (por volta
da linha 274-283), o bloco hoje é:

```tsx
<h3 className="text-base font-semibold">{plan.name}</h3>
<p className="mt-1 text-sm text-muted-foreground">
  {plan.description}
</p>
<p className="mt-6 text-3xl font-semibold tracking-tight">
  A definir
</p>
<p className="mt-1 text-xs text-muted-foreground">
  valor divulgado em breve
</p>
```

Troque os dois `<p>` de preço para ler do `plan`:

```tsx
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
```

- [ ] **Step 4: Verificar tipos, lint e build**

```bash
cd web
npm run typecheck
npm run lint
npm run build
```

Esperado: typecheck limpo; lint sem problema novo (o único esperado é o erro
pré-existente em `landing-header.tsx:19`, não neste arquivo); build conclui sem erro.

- [ ] **Step 5: Verificar visualmente os 3 preços renderizados**

```bash
cd web
npm run dev &
sleep 3
curl -s http://localhost:3000/ | grep -o 'R\$ [0-9]*,[0-9]*' 
kill %1
```

Esperado: as três linhas `R$ 49,90`, `R$ 89,90`, `R$ 179,90` aparecem na saída, na ordem
Essencial → Profissional → Equipe. Se o dev server não estiver na porta 3000, ajuste a
URL. Depois disso, abrir `http://localhost:3000/#precos` num browser e conferir visualmente
em light e dark mode (toggle do sistema ou DevTools) que os 3 cards mostram valor e
"/mês", e que a nota de transparência aparece abaixo do título da seção.

- [ ] **Step 6: Commit**

```bash
git add web/app/page.tsx
git commit -m "feat(web): show real prices on the landing page pricing section"
```

## Self-Review

**Cobertura do spec:** os 3 valores (`R$ 49,90` / `R$ 89,90` / `R$ 179,90`) — Step 1; nota
de transparência — Step 2; troca do "A definir" no card — Step 3. O spec não pede nada em
`server/`, checkout, desconto anual ou página separada — nada disso tem task, de propósito
(seção "Fora de escopo" do spec).

**Placeholders:** nenhum "TBD"/"implementar depois" — todo step tem o código exato a
escrever, antes e depois.

**Consistência de tipos:** `price` e `priceSuffix` são `string` nos três itens do array e
consumidos como `{plan.price}` / `{plan.priceSuffix}` no JSX — mesmo nome dos dois lados,
única task, sem outro consumidor no plano.
