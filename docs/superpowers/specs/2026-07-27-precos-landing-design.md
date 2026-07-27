# Preços na landing page — design

**Data:** 2026-07-27

## Problema

A seção `#precos` de `web/app/page.tsx` já tem os 3 planos escaffoldados (Essencial,
Profissional, Equipe) com nome, descrição e lista de recursos, mas o preço de cada um é
"A definir". Faltam os valores reais, calculados a partir do custo real de operar o
produto — não um chute de mercado.

## Decisões

### Base de custo: infra completa, não só o que já está no ar

Hoje só Postgres + API rodam (Railway). O modelo de custo usa a infra completa que o
produto vai precisar em produção — incluindo Vercel, que ainda não foi provisionado:

| Item | Custo | Observação |
| --- | --- | --- |
| Railway (Postgres + API), Hobby | US$5/mês | já provisionado |
| Vercel Pro | US$20/mês | Hobby (grátis) proíbe uso comercial/SaaS — Pro é obrigatório, não opcional |
| Domínio | ~R$50/ano ≈ R$4,17/mês | ainda não registrado |
| Resend (e-mail transacional) | R$0 | grátis até 3.000 e-mails/mês, cobre o início |
| **Total** | **≈ R$131/mês** | câmbio de referência: US$1 ≈ R$5,08 (2026-07) |

Usar o custo da infra completa — não só do que está no ar hoje — significa que o preço já
nasce certo para quando a Fase 1 terminar (Vercel incluso); não precisa recalcular quando
o front for pro ar.

### Rateio: 10 negócios pagantes

Decisão tomada em conversa: cenário conservador de início de operação. R$131 ÷ 10 ≈
**R$13,10/negócio/mês** de custo-piso. Um rateio mais otimista (30+ negócios) diluiria
mais o custo fixo e daria um preço-piso mais baixo, mas apostar nisso desde o primeiro
cliente decepciona a margem real se a base demorar a crescer.

### Margem: 75% sobre o custo-piso

Preço-piso = custo ÷ (1 − margem) = R$13,10 ÷ 0,25 ≈ **R$52/mês**. É o piso do plano mais
barato (Essencial) — os planos acima não têm custo de infra proporcionalmente maior (a
mesma instância Railway atende todos os tenants nesta escala), então o preço deles reflete
valor/funcionalidade sobre o mesmo piso de custo, não custo real maior.

### Os 3 valores

| Plano | Preço | Por quê |
| --- | --- | --- |
| Essencial | **R$49,90/mês** | arredondado do piso calculado (R$52) pro padrão `.90` de precificação B2B |
| Profissional | **R$89,90/mês** | já é o "mais popular" no design atual — margem maior banca suporte prioritário |
| Equipe | **R$179,90/mês** | multi-unidade, onboarding dedicado — cliente maior, margem mais alta |

Arredondar o Essencial para R$49,90 (abaixo do piso teórico de R$52,40) é uma concessão
deliberada de ~5%: fecha num preço psicológico melhor sem sair da faixa "com margem
saudável" — não é o caso de Profissional/Equipe, que ficam acima do piso.

## Front-end

`web/app/page.tsx`, seção `#precos`:

- Array `plans`: cada item ganha `price: string` (`"R$ 49,90"`, `"R$ 89,90"`,
  `"R$ 179,90"`) e `priceSuffix: "/mês"`. Estrutura de dados já existe (`name`,
  `description`, `features`, `highlighted`); só acrescenta os dois campos novos.
- No JSX do card, troca o bloco fixo `"A definir"` / `"valor divulgado em breve"` por
  `{plan.price}` (mesmo estilo `text-3xl font-semibold`) e `{plan.priceSuffix}` (mesmo
  estilo `text-xs text-muted-foreground` que já existe).
- Abaixo do subtítulo da seção (`"Os valores ainda estão sendo definidos..."` — esse texto
  é removido, não faz mais sentido), uma nota de transparência, mesmo estilo do subtítulo
  atual (`text-muted-foreground`, centralizado): *"Preço calculado a partir do custo real
  de operação, com margem sustentável — sem surpresa depois."*
- CTA de cada card continua "Falar com a gente" — sem checkout automático, fora do escopo
  do MVP (`PRD.md`, seção 5).

## Testes

Não há lógica pura nova — é troca de conteúdo estático numa página de marketing. Sem teste
automatizado; verificação é visual (rodar `npm run dev` em `web/`, abrir `/`, conferir a
seção `#precos` renderizando os 3 valores e a nota, em light e dark mode).

## Fora de escopo

Checkout/pagamento online (já fora do MVP) · desconto anual · calculadora de preço
interativa · página de preços separada (`/precos`) · atualizar o `PRD.md` com os valores
(o PRD nunca teve seção de preço; não é o lugar — preço é decisão de negócio, não requisito
funcional) · reavaliar os valores quando o custo real de infra mudar (ex.: sair do trial do
Railway, Vercel Pro entrar em uso) — fica para quando isso acontecer de fato, não é
"a definir" hoje.
