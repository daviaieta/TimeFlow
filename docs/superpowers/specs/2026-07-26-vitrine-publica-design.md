# Vitrine pública do negócio — design

**Data:** 2026-07-26
**Branch:** `feat/public-showcase`
**Contexto:** hoje `/[slug]` cai direto no primeiro passo do assistente de
agendamento ("O que vamos agendar?"). Quem recebe o link não vê o negócio: não sabe
quem atende, o que mais é oferecido, nem que cara tem a marca. Falta a página que o
dono realmente vai colar no Instagram e no WhatsApp.

O `Business` no schema tem apenas `name` e `slug`; o `User` tem `name` e `email`. Não
existe logo, banner, descrição, endereço, telefone nem foto de colaborador — e o
upload de avatar (RF19) está explicitamente fora do MVP.

## Decisões de produto

- **A vitrine vem antes do assistente.** `/[slug]` passa a ser a apresentação e o
  assistente muda para `/[slug]/agendar`. O agendamento em si não muda de
  comportamento.
- **Zero mudança de schema.** A página se sustenta só no que
  `GET /public/businesses/:slug` já devolve. Nenhum arquivo do servidor é tocado.
  Alternativa considerada e recusada: adicionar `logoUrl`/`bannerUrl`/`description`
  agora. Sem a tela de admin para preencher (Fase 2), os campos ficariam nulos e o
  resultado na tela seria idêntico, com backend a mais.
- **Identidade visual gerada, não vazia.** Banner é um gradiente derivado do hash do
  slug; logo é um monograma com as iniciais; equipe usa avatares de iniciais. Mesmo
  negócio sempre com o mesmo visual; negócios diferentes com visuais diferentes.
- **Costurado para receber imagem real depois.** `BusinessMark` e `TeamAvatar` nascem
  com `src?: string | null`. Hoje sempre nulo. Quando a Fase 2 trouxer os campos, é
  troca de prop, não redesenho.
- **A marca da Time Flow fica no rodapé**, como "Powered by", e não no lugar da logo
  do negócio: a marca do fornecedor ocupando o lugar da marca do cliente confunde
  quem vai agendar. O monograma de iniciais lê como identidade do próprio negócio.
- **Nada de endereço, telefone ou horário de funcionamento.** Não existem no schema, e
  placeholder falso numa página que o dono mostra para os clientes dele é pior que
  ausência.
- **Server component com `generateMetadata`.** É a única página do produto feita para
  ser compartilhada; o assistente é client-side e não gera metadata nenhuma.

## 1. Rotas

| Rota | O que é |
| --- | --- |
| `/[slug]` | vitrine (novo) |
| `/[slug]/agendar` | o assistente atual, movido sem mudança de comportamento |
| `/[slug]/agendar?servico=<id>` | assistente já no passo 2, com o serviço escolhido |

O deep link é o que liga as duas páginas: cada card de serviço na vitrine leva ao
assistente com aquele serviço já selecionado, pulando o passo 1.

## 2. Dados

Tudo vem de uma chamada a `GET /public/businesses/:slug`, que já devolve:

```ts
{
  business: { name: string; slug: string };
  professionals: { id: number; name: string; nextSlot: NextSlot | null }[];
  services: {
    id: number; name: string; duration: number; price: string;
    employees: { id: number; name: string; nextSlot: NextSlot | null }[];
  }[];
}
```

`nextSlot` já vem calculado por profissional e por serviço — é o dado mais valioso da
página e não custa nada.

## 3. Seções

**Banner e identidade.** Backdrop gerado, monograma sobreposto, nome do negócio, uma
linha de apoio e o botão "Agendar horário". Junto, o selo de disponibilidade —
*"Próximo horário: hoje 14:30"* — via `earliestNextSlot` sobre `professionals`. Quando
não há nenhum horário livre, o selo some em vez de mostrar estado vazio.

**Serviços.** Todos, com nome, duração, preço e quantos profissionais atendem. Cada um
com botão que deep-linka para o assistente.

**Equipe.** Avatar de iniciais, nome, os serviços que a pessoa atende e o próximo
horário livre dela. A lista de serviços por pessoa sai de inverter o mapa
`services[].employees`, que já vem na resposta — sem request adicional.

**Rodapé.** "Powered by Time Flow" com a `LogoMark` existente, linkando para a landing.

## 4. Estados

- **Carregando:** esqueleto com a mesma silhueta das seções.
- **Negócio inexistente:** `notFound()` do Next, com a página 404.
- **Sem serviços cadastrados:** a seção de serviços some e o CTA principal também — não
  há o que agendar. O banner e a equipe continuam.
- **Sem horários livres:** a página inteira continua; some apenas o selo de
  disponibilidade e os "próximo horário" individuais.

## 5. Arquivos

**Novos:**

- `web/app/[slug]/page.tsx` — a vitrine (reescrito; hoje só monta o assistente)
- `web/app/[slug]/showcase-hero.tsx` — banner, identidade e CTA
- `web/app/[slug]/services-section.tsx`
- `web/app/[slug]/team-section.tsx`
- `web/app/[slug]/agendar/page.tsx` — o assistente, movido
- `web/components/business-mark.tsx` — monograma, com `src` para o futuro
- `web/components/team-avatar.tsx` — avatar de iniciais, mesmo contrato
- `web/lib/showcase.ts` + `web/lib/showcase.test.ts`

**Modificado:**

- `web/app/[slug]/booking-wizard.tsx` — aceita serviço pré-selecionado

**Nenhum arquivo do servidor.**

## 6. Lógica pura

Em `web/lib/showcase.ts`, testada em `showcase.test.ts`:

- `businessGradient(slug: string): { from: string; to: string }` — hash determinístico
  do slug em dois matizes HSL.
- `servicesByEmployee(services: PublicService[]): Map<number, string[]>` — inverte o
  mapa serviço→profissionais em profissional→serviços.

Reusa sem duplicar: `earliestNextSlot`, `nextSlotLabel`, `formatPrice` (`lib/publicBooking.ts`),
`formatMinutes` (`lib/schedule.ts`), `businessInitials` e `formatBusinessName`
(`lib/businessName.ts`). `businessInitials` já serve para nome de pessoa — devolve as
iniciais das duas primeiras palavras.

## 7. Notas de execução

- O `web/AGENTS.md` avisa que esta versão do Next tem quebras em relação ao
  conhecimento prévio. Ler `node_modules/next/dist/docs/` antes de escrever o server
  component e o `generateMetadata`.
- Puxar a skill `frontend-design` para o tratamento visual do banner, para não sair com
  cara de template.
- A vitrine nasce mobile-first, conforme a regra que atravessa as fases do MVP.
