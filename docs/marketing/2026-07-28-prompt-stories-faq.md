# PROMPT PARA O CLAUDE DESIGN — Sequência de Stories "FAQ" · Time Flow

> Copie tudo abaixo da linha e envie ao Claude Design. O prompt é autossuficiente:
> não deve gerar nenhuma pergunta de volta.

---

## 0. PAPEL

Você é o **Diretor de Arte e Designer de Marca sênior** de um estúdio que faz identidade e
campanha para startups de software — o tipo de estúdio que assina o rebrand da Linear, a
campanha de lançamento da Vercel, os Stories da Raycast, a página de produto da Stripe.

Você não é um "criador de conteúdo". Você não faz post de agência genérica, não faz
carrossel motivacional, não faz slide de apresentação. Você faz **peça de marca**.

Sua entrega é uma sequência de Stories para Instagram, formato vertical, destinada a um
destaque permanente do perfil chamado **FAQ**.

Execute a tarefa inteira sem fazer perguntas. Todas as decisões que faltarem estão
autorizadas a você — decida com critério de diretor de arte e siga.

---

## 1. O PRODUTO (fatos verificados — não invente nada além disto)

**Nome:** Time Flow
**Categoria:** SaaS de agendamento online, multi-tenant.
**Para quem:** negócios de serviço com hora marcada — barbearias, salões, clínicas,
consultórios, estúdios, autônomos.
**Promessa central da landing:** *"Sua agenda online, sem conflito de horário."*

### Como o produto funciona (verdade técnica, já em produção)

- Cada negócio ganha uma **página pública própria** em `timeflow.app/{slug}` — ex.:
  `timeflow.app/barbearia-old-brothers`. É o link que o dono cola na bio do Instagram e no
  WhatsApp.
- O cliente final agenda em **4 passos**: serviço → profissional → horário → dados.
- O cliente final **não cria conta e não instala nada**. Informa nome e WhatsApp; e-mail é
  opcional.
- **Não existe conflito de horário.** Uma reserva ocupa N slots consecutivos e é reservada
  como um bloco atômico dentro de uma transação de banco: ou o bloco inteiro é seu, ou a
  reserva não acontece. Dois clientes disputando o mesmo horário resultam em exatamente uma
  reserva. Isso é a espinha dorsal do produto, não um detalhe.
- Horário reservado **some em tempo real** para quem ainda está escolhendo.
- O dono tem **painel com agenda em timeline**, KPIs, taxa de ocupação e mapa de calor dos
  horários.
- **Equipe por convite:** o dono convida colaboradores por e-mail; cada um define a própria
  disponibilidade e é vinculado aos serviços que executa.
- **Reserva interna:** o dono/atendente registra pelo painel a reserva que chegou por
  telefone ou no balcão — ela entra na mesma agenda e respeita as mesmas travas.
- **E-mail transacional:** convite de equipe e confirmação de reserva para o cliente quando
  ele informa e-mail.
- **Isolamento entre negócios:** todo dado é restrito ao negócio do usuário logado. Nenhum
  negócio lê ou escreve dado de outro.

### Planos e preço (valores reais, publicados)

| Plano | Preço | Para quem |
| --- | --- | --- |
| Essencial | **R$ 49,90/mês** | 1 profissional |
| Profissional | **R$ 89,90/mês** | até 5 profissionais — *mais popular* |
| Equipe | **R$ 179,90/mês** | profissionais ilimitados, múltiplas unidades |

Posicionamento de preço da marca: *"Preço calculado a partir do custo real de operação, com
margem sustentável — sem surpresa depois."*

### Verdades desconfortáveis que a marca assume (NÃO maquie, NÃO omita, NÃO invente o contrário)

- **Não existe cadastro público.** O negócio entra **por convite**: fala com a gente, a
  gente cadastra, a equipe recebe o acesso por e-mail. Isso é escolha de produto, e a
  comunicação trata isso como curadoria — não como limitação.
- **Não existe período de teste grátis hoje.** Fica para versão futura. A resposta honesta
  é: preferimos conversar antes e configurar seu negócio junto com você.
- **Não existe disparo automático de mensagem no WhatsApp.** O que existe: o WhatsApp do
  cliente fica registrado na reserva, e o link de agendamento é feito para ser colado no
  WhatsApp e no Instagram. Se for usar essa FAQ, responda exatamente essa verdade.
- **Não é aplicativo.** É web. Não há nada para instalar, nem para o dono nem para o
  cliente.
- **Não há checkout self-service de plano na landing.** O CTA é *"Falar com a gente"*, que
  leva à página `/contato`.

---

## 2. O QUE VOCÊ VAI ENTREGAR

Uma **sequência de 12 Stories** (1080 × 1920 px, 9:16) para o destaque **FAQ**:

| # | Papel na sequência |
| --- | --- |
| 01 | **Capa do destaque** — peça de marca pura. É a miniatura circular do destaque; precisa funcionar recortada em círculo de 60px E em tela cheia. |
| 02 | **Abertura / promessa** — enquadra por que essa sequência existe. |
| 03–11 | **Nove perguntas**, uma por Story. |
| 12 | **Fechamento / CTA** — para `/contato`. |

Você escolhe **quais nove perguntas** entram e **em que ordem**, a partir do banco da
seção 6. A ordem é dramatúrgica, não aleatória: comece pelas objeções que travam o primeiro
contato, termine nas de compromisso (preço, como começar).

---

## 3. IDENTIDADE VISUAL — REUTILIZE, NÃO REINVENTE

Esta identidade já existe no produto. Ela é a fonte da verdade. Você não cria uma nova
paleta, uma nova fonte, um novo logo.

### 3.1 Logo

Marca gráfica em SVG, viewBox `0 0 64 64` — um calendário estilizado:

```svg
<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="14" y="4" width="8" height="14" rx="3" fill="#3730a3"/>
  <rect x="36" y="4" width="8" height="14" rx="3" fill="#3730a3"/>
  <rect x="4" y="10" width="52" height="50" rx="12" fill="#3730a3"/>
  <path d="M18 36l10 10 18-21" stroke="#22d3ee" stroke-width="7"
        stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="55" cy="11" r="7" fill="#fbbf24"/>
</svg>
```

Leitura: corpo de calendário indigo, **check ciano** (a confirmação), **ponto âmbar** no
canto superior direito (o alerta / o horário que acabou de cair). Logotipo ao lado da marca:
**"Time Flow"**, peso semibold, `letter-spacing` apertado (`tracking-tight`).

**Regras do logo:**
- Sobre fundo escuro ou colorido, use uma versão monocromática branca do mesmo desenho
  (corpo `#ffffff` com opacidade, check e ponto podem manter ciano/âmbar como único acento).
- Área de respiro mínima ao redor: 1× a altura da marca.
- Nunca distorça, nunca rotacione, nunca aplique gradiente sobre o desenho, nunca troque as
  cores do check e do ponto entre si.
- O logo aparece **pequeno e discreto** nos Stories de pergunta (assinatura no rodapé, 32–40
  px de altura). Grande só na capa e no fechamento.

### 3.2 Paleta

Indigo é a marca. Ciano é a confirmação. Âmbar é o acento raro. Zinc é a estrutura.

| Papel | Token | Hex | Uso |
| --- | --- | --- | --- |
| Indigo profundo | `indigo-950` | `#1e1b4b` | fundos escuros, base do gradiente noturno |
| Indigo escuro | `indigo-900` | `#312e81` | fundo, blocos densos |
| **Indigo marca** | `indigo-800` | `#3730a3` | **cor do logo** |
| Indigo forte | `indigo-700` | `#4338ca` | topo do gradiente do hero |
| **Indigo primário** | `indigo-600` | `#4f46e5` | **cor de ação — botões, destaques** |
| Indigo médio | `indigo-500` | `#6366f1` | meio do gradiente |
| Indigo claro | `indigo-200` | `#c7d2fe` | fim do gradiente, texto de apoio sobre escuro |
| Indigo névoa | `indigo-50` | `#eef2ff` | fundo claro, superfícies |
| **Ciano acento** | `cyan-400` | `#22d3ee` | **o check, confirmação, "sim"** |
| Ciano UI | `cyan-500` | `#06b6d4` | ícones de checklist |
| **Âmbar acento** | `amber-400` | `#fbbf24` | **um único ponto por peça, no máximo** |
| Preto de fundo | — | `#252525` (`oklch(0.145 0 0)`) | fundo do modo escuro do produto |
| Branco | — | `#ffffff` | fundo do modo claro |
| Zinc 900 | | `#18181b` | texto forte sobre claro |
| Zinc 500 | | `#71717a` | texto secundário |
| Zinc 200 | | `#e4e4e7` | bordas |
| Zinc 50 | | `#fafafa` | superfície clara |

**Gradiente assinatura da marca** (vem do hero da landing):
`linear-gradient(180deg, #4338ca 0%, #6366f1 55%, #c7d2fe 100%)`.
Use com parcimônia — ele é a peça-assinatura, não o papel de parede de tudo.

**Regras de cor:**
- Cada Story escolhe **um** dos três registros: *escuro* (indigo-950 → preto), *claro*
  (branco / indigo-50) ou *gradiente assinatura*. Nunca misture os três na mesma peça.
- Máximo **duas cores de acento visíveis por peça**. Se o ciano está trabalhando, o âmbar
  fica fora — ou aparece como um ponto de 8px e nada mais.
- Nada de gradiente arco-íris, nada de indigo→rosa, nada de "aurora" genérica de IA.
- Contraste mínimo 4.5:1 em qualquer texto que precise ser lido. Story é consumido no sol,
  no ônibus, com 3 segundos de atenção.

### 3.3 Tipografia

- **Fonte primária: Figtree** (Google Fonts) — títulos e corpo. É a `--font-sans` do
  produto.
- **Fonte mono: Geist Mono** — exclusivamente para números, horários, o slug
  `timeflow.app/…`, rótulos técnicos e etiquetas de FAQ (`01 / 09`). Nunca para texto
  corrido.
- Pesos: 400 (corpo), 500 (rótulos), 600 (títulos — o peso da marca), 700 só quando o
  título é curtíssimo e precisa de peso de cartaz.
- **`letter-spacing` negativo nos títulos** (`-0.02em` a `-0.035em`). Isso é assinatura da
  marca — títulos apertados, corpo normal.
- `line-height` de título: 0.95 a 1.05. Título de Story respira por fora, não por dentro.

**Escala tipográfica para 1080 × 1920** (use como grade, não como sugestão vaga):

| Papel | Tamanho | Peso | Tracking |
| --- | --- | --- | --- |
| Título-cartaz (1 a 4 palavras) | 132–160 px | 600 | -0.035em |
| Pergunta (título padrão) | 92–112 px | 600 | -0.03em |
| Subtítulo / resposta longa | 44–52 px | 400 | -0.01em |
| Corpo de apoio | 34–38 px | 400 | 0 |
| Rótulo / eyebrow (caixa alta) | 24–26 px | 500 | +0.14em |
| Numeral mono (`03/09`) | 26–30 px | 500 | +0.06em |

**Regra dura:** no máximo **3 tamanhos de tipo por Story**. Hierarquia se faz com escala e
espaço, não com sete tamanhos.

### 3.4 Forma, superfície e ícone

- **Raio:** o produto usa base `10px` com uma escala derivada. Nos Stories: pílulas e
  botões com `border-radius: 999px`; cartões e blocos com `28–40px`. Nunca cantos vivos
  misturados com cantos redondos na mesma peça.
- **Superfícies:** cartão branco com sombra ampla e suave sobre fundo colorido
  (`box-shadow: 0 40px 80px -20px rgba(30,27,75,.45)`), ou vidro escuro
  (`rgba(255,255,255,.06)` + `border: 1px solid rgba(255,255,255,.1)`) sobre indigo-950.
- **Bordas:** 1px, sempre de baixo contraste. Borda é hierarquia, não decoração.
- **Ícones:** biblioteca **Hugeicons** (linha, stroke ~1.5–2px, cantos arredondados) — é a
  que o produto usa. Ícones em tamanho grande e sozinho, nunca uma fileira de seis ícones
  decorativos. Se não houver ícone Hugeicons adequado, desenhe um pictograma no mesmo
  vocabulário: traço uniforme, terminações arredondadas, geometria simples.
- **Elementos gráficos autorizados** (repertório da marca — use estes, não invente
  metáforas novas):
  1. **Grade de horários** — pílulas com `09:00 · 09:30 · 10:00…`, uma delas riscada (o
     horário que acabou de ser reservado).
  2. **Trilho de timeline vertical** com blocos de reserva, como a agenda do painel.
  3. **Barra de navegador** minimalista mostrando `timeflow.app/seu-negocio`.
  4. **Check ciano** — o traço do logo, isolado e ampliado.
  5. **Stepper de 4 passos** (serviço · profissional · horário · dados).
  6. **Ponto âmbar** pulsando — a reserva que acabou de entrar.
  7. **Mapa de calor** de ocupação em blocos indigo de opacidades diferentes.

### 3.5 Voz e escrita

O produto fala **português do Brasil**, na primeira pessoa do plural, com frases curtas e
concretas. Referência de tom, direto da landing:

> "Dois clientes nunca reservam o mesmo horário. A disponibilidade é travada no momento da
> confirmação."
> "Compartilhe seu link e receba reservas direto — o cliente não precisa criar conta."

**Faça:** frases afirmativas, sujeito e verbo, número exato no lugar de adjetivo,
travessão (—) como pausa de raciocínio, ponto final.
**Não faça:** exclamação, emoji, ALL CAPS gritado, "revolucione", "transforme", "chega de",
"nunca mais", "descomplique", "simplifique sua vida", "o app que", "🚀". Nada de pergunta
retórica de anúncio ("Cansado de perder cliente?"). Nada de tratar o leitor como
incompetente.

Duas regras de copy específicas de Story:
1. A **pergunta** é escrita como o cliente realmente pensaria — coloquial, curta.
2. A **resposta** abre com uma palavra de veredicto isolada (**Não.** / **Sim.** /
   **Ainda não.**) e só depois explica. O veredicto é a peça tipográfica; a explicação é o
   apoio.

---

## 4. DIREÇÃO CRIATIVA

### Conceito guarda-chuva

**"Perguntas simples merecem respostas diretas."**

A sequência inteira é uma demonstração de clareza: um produto que elimina conflito de
agenda responde suas dúvidas sem rodeio. A forma prova a tese — cada peça tem uma ideia,
uma frase, um gesto visual. Se a peça precisa de explicação, ela falhou.

Trate o destaque FAQ como **uma peça só, dividida em 12 quadros** — há continuidade formal,
progressão de cor e um sistema que se reconhece do primeiro ao último. Não são 12 designs
independentes.

### Sistema de ritmo (isto é o que impede a sequência de virar apresentação)

Cada Story pertence a um dos quatro **tipos de quadro**. Alterne os tipos para criar
respiração — nunca três quadros do mesmo tipo em sequência:

- **Tipo A · Cartaz** — só tipografia, fundo sólido ou gradiente, zero elemento gráfico.
  Uma frase enorme no espaço vazio.
- **Tipo B · Objeto** — um único elemento de produto (grade de horário, barra de navegador,
  timeline) grande, em ângulo reto, flutuando com sombra, com o texto curto ao redor.
- **Tipo C · Diagrama** — a resposta é uma relação: dois estados, um antes/depois, um
  fluxo de quatro passos. Traço fino, muito ar, rótulos mono.
- **Tipo D · Marca** — logo, cor de assinatura, quase sem texto. Usado na capa, no
  fechamento e, no máximo, uma vez no meio como pausa.

**Progressão de cor obrigatória:** a sequência começa escura (capa/abertura), abre para
claro no miolo das perguntas objetivas, passa pelo gradiente assinatura em 1 ou 2 momentos
de virada, e fecha escura no CTA. A pessoa que assiste os 12 sente um arco, mesmo sem saber
por quê.

### Referências de qualidade (a régua)

Linear (contraste de escuro absoluto e tipo apertado) · Stripe (rigor de grade e
diagrama) · Vercel (preto, branco, nada sobrando) · Raycast (superfícies de vidro e cor
concentrada) · Apple (tipo-cartaz e vazio como material) · Notion (calor e humanidade sem
perder ordem).

**Não é referência:** template de Canva, post de agência de marketing digital, "5 dicas
para…", fundo com bokeh, mockup de iPhone em perspectiva com mão segurando, foto de banco
de imagem, ícone 3D colorido, degradê de IA genérico.

---

## 5. GRADE, COMPOSIÇÃO E REGRAS TÉCNICAS DE STORY

**Tela:** 1080 × 1920 px.

**Zonas seguras — respeite com rigor, o Instagram cobre estas áreas:**
- Topo: **250 px** reservados (avatar, nome do perfil, barra de progresso).
- Base: **250 px** reservados (campo "Envie uma mensagem", botões de reação).
- Laterais: **72 px** de margem mínima.
- **Toda informação essencial vive na faixa vertical de 250 px a 1670 px.**

**Grade:**
- Coluna útil: 936 px de largura.
- Grade de 6 colunas com calha de 24 px, para alinhar objetos e blocos.
- Base de espaçamento **8 px**. Todo espaço vertical é múltiplo de 8. Saltos de hierarquia
  usam múltiplos grandes (48, 64, 96, 128) — não 20, não 35.

**Composição:**
- **Ocupação máxima de 45% da área útil.** Mais da metade da peça é vazio. Isso não é
  negociável — é o que separa a peça premium do slide.
- Um único ponto focal por peça. O olho entra em um lugar e desce.
- Alinhamento consistente: escolha **à esquerda** como padrão do sistema (ancora bem em
  vertical) e reserve **centralizado** para os quadros Tipo A e Tipo D.
- Ancoragem: título com margem superior generosa (respira do topo da zona segura), resposta
  logo abaixo, assinatura no rodapé da zona segura. Nunca distribua conteúdo até encostar
  nos quatro cantos.
- Rodapé de sistema (presente em todos os quadros de pergunta, discreto, 24 px, opacidade
  0.5): `timeflow.app` à esquerda, `03/09` em mono à direita.

**Legibilidade:**
- Nenhuma linha de texto passa de **28 caracteres** em título e **42 caracteres** em corpo.
- Teste do polegar: a peça precisa entregar a ideia em **1,5 segundo**.
- Teste da miniatura: reduza a peça para 120 px de altura — o título ainda tem de ser
  identificável como título.

---

## 6. BANCO DE PERGUNTAS (escolha 9 · respostas já validadas)

Cada item traz a **verdade do produto**. Você pode reescrever a redação para ficar mais
afiada, mas **não pode mudar o fato**. Selecione as nove que mais destravam um cliente antes
do primeiro contato, e ordene.

| # | Pergunta | Verdade que a resposta precisa carregar |
| --- | --- | --- |
| 1 | Preciso instalar algum aplicativo? | Não. É web. Nem você nem seu cliente instalam nada. Abre no navegador. |
| 2 | Meu cliente precisa criar conta? | Não. Ele escolhe serviço, profissional e horário e informa nome e WhatsApp. E-mail é opcional. |
| 3 | Funciona no celular? | Sim. A página de agendamento é feita para o celular — é o link que você cola na bio e manda no WhatsApp. |
| 4 | Dois clientes podem marcar o mesmo horário? | Não. O horário é travado no instante da confirmação, dentro de uma transação. Um horário, uma reserva. Sempre. |
| 5 | Como eu recebo os agendamentos? | Caem direto na sua agenda no painel, em tempo real. Quem informa e-mail recebe a confirmação por e-mail. |
| 6 | Posso adicionar minha equipe? | Sim. Você convida por e-mail, cada profissional cuida da própria disponibilidade e fica ligado aos serviços que executa. O plano define quantos: 1, até 5, ou ilimitado. |
| 7 | Integra com WhatsApp? | Ainda não há disparo automático. O WhatsApp do cliente fica registrado na reserva, e seu link de agendamento foi feito para colar no WhatsApp e no Instagram. |
| 8 | E a reserva que chega por telefone? | Você registra pelo painel. Ela entra na mesma agenda e respeita as mesmas travas de horário. |
| 9 | Tem período de teste? | Ainda não. Preferimos conversar antes e configurar seu negócio junto com você. |
| 10 | Quanto custa? | R$ 49,90, R$ 89,90 ou R$ 179,90 por mês. Preço calculado a partir do custo real de operação — sem surpresa depois. |
| 11 | Meus dados ficam separados dos outros negócios? | Sim. Cada negócio opera isolado. Ninguém lê nem escreve dado de outro negócio. |
| 12 | Consigo saber quais horários enchem? | Sim. O painel mostra ocupação, ranking de serviços e mapa de calor dos horários. |
| 13 | Como faço para começar? | Fale com a gente. Negócios entram por convite: a gente cadastra o seu e sua equipe recebe o acesso por e-mail. |
| 14 | Quanto tempo leva para colocar no ar? | Configuração de serviços, equipe e horários no mesmo dia da conversa. Não há migração complicada. *(Se usar, mantenha a formulação genérica — não prometa prazo em horas.)* |

**Critério de seleção:** priorize objeções que impedem o contato (1, 2, 3, 4, 7, 9) sobre
curiosidades de recurso. Preço (10) e como começar (13) vão perto do fim. A pergunta 4 é a
mais estratégica do produto — ela merece o quadro mais forte da sequência.

---

## 7. O QUE ENTREGAR PARA CADA STORY

Para os **12 Stories**, escreva uma ficha completa, nesta ordem exata de campos:

```
STORY 03 — "Meu cliente precisa criar conta?"
├── Tipo de quadro:        B · Objeto
├── Registro cromático:    Claro (branco / indigo-50), acento ciano
├── Conceito visual:       [a ideia em uma frase — o que a peça faz o leitor sentir/entender]
├── Copy exata:
│     Eyebrow:   FAQ · 02
│     Título:    "Meu cliente precisa criar conta?"
│     Veredicto: "Não."
│     Apoio:     "Ele escolhe, informa nome e WhatsApp, e pronto."
│     Rodapé:    timeflow.app · 02/09
├── Composição:            [posição de cada elemento em coordenadas/percentuais, tamanhos,
│                          margens, o que ocupa o vazio e o que fica vazio de propósito]
├── Hierarquia:            [ordem de leitura 1→2→3→4 e o mecanismo que a força:
│                          escala, cor, peso, isolamento]
├── Direção de arte:       [tratamento de superfície, sombra, borda, textura, iluminação,
│                          detalhe que faz a peça parecer cara]
├── Tipografia aplicada:   [fonte, tamanho em px, peso, tracking e leading de cada bloco]
├── Animação sugerida:     [entrada por elemento, com delay em ms, curva de easing e
│                          duração; qual elemento entra por último e por quê]
├── Transição de saída:    [como esta peça conversa com a próxima — elemento que persiste,
│                          corte de cor, movimento que continua]
└── Nota de produção:      [o que NÃO fazer nesta peça]
```

**Sobre animação — seja específico e contido.** O padrão da marca é sóbrio: opacidade +
translação curta (16–24 px), duração 400–700 ms, easing `cubic-bezier(0.16, 1, 0.3, 1)`,
delays escalonados de 80–120 ms, no máximo 4 elementos animados por peça. Um único gesto
"caro" por peça (o check que se desenha, a pílula de horário que é riscada, o ponto âmbar
que pulsa uma vez). Zero bounce, zero rotação, zero zoom dramático, zero partícula.

**Sobre transição — a sequência precisa de costura.** Toda transição usa uma destas
famílias, e você declara qual: *persistência* (um elemento fica no mesmo lugar entre dois
quadros), *herança de cor* (o fundo do próximo é a cor do acento do anterior), *continuidade
de movimento* (algo sai por uma borda e entra pela oposta no próximo), ou *corte seco*
(usado de propósito, para marcar mudança de bloco temático).

---

## 8. ALÉM DAS 12 FICHAS, ENTREGUE TAMBÉM

1. **Mapa da sequência** — tabela com os 12 quadros: número, pergunta, tipo de quadro,
   registro cromático, tipo de transição. Serve para enxergar o arco e provar que o ritmo
   alterna.
2. **Mini design system da campanha** — os tokens que você fixou: cores em uso, escala
   tipográfica final, espaçamentos, raios, sombras, especificação do rodapé de sistema e da
   assinatura. Escrito de forma que outra pessoa produza o Story 13 sem quebrar o sistema.
3. **Artboards em HTML + CSS** — os 12 quadros como código autocontido, prontos para
   captura em 1080 × 1920:
   - Um único arquivo HTML, cada Story como uma `<section>` de exatamente 1080 × 1920 px.
   - Fontes Figtree e Geist Mono via Google Fonts.
   - SVG do logo e dos pictogramas **inline** — nenhuma imagem externa, nenhum ícone de CDN.
   - Animações em CSS (`@keyframes`), disparadas no carregamento, exatamente como descritas
     nas fichas.
   - Guias de zona segura em um `<div>` com `outline` tracejado, controlado por uma classe
     `.guides` no `<body>` que pode ser removida para exportar limpo.
   - Comentário no topo de cada seção com o número e a pergunta do Story.

---

## 9. REGRAS DURAS (violação = peça rejeitada)

1. **Nunca pareça um slide.** Sem título-no-topo-e-bullets-embaixo. Sem caixa de texto
   centralizada com fundo colorido. Sem "Pergunta / Resposta" em duas colunas iguais.
2. **Sem stock photo, sem mockup de mão segurando celular, sem 3D, sem ilustração de
   personagem, sem emoji, sem badge de "novo".**
3. **Um único ponto focal por peça.** Se você tem dois candidatos, corte um.
4. **45% de ocupação máxima.** Vazio é material da marca, não espaço não aproveitado.
5. **Três tamanhos de tipo, no máximo, por peça.**
6. **Duas cores de acento, no máximo, por peça.**
7. **Não invente recurso que o produto não tem.** Especialmente: automação de WhatsApp,
   teste grátis, app de loja, cadastro público, pagamento pelo cliente final dentro da
   reserva.
8. **Não use ponto de exclamação nem pergunta retórica de anúncio.**
9. **Não coloque nada essencial nos 250 px do topo nem nos 250 px da base.**
10. **A capa do destaque precisa sobreviver ao recorte circular** — teste mentalmente o
    círculo de 60 px: o que sobra tem de ser reconhecível como Time Flow.
11. **Consistência de sistema:** rodapé, numeração, posição do logo e escala tipográfica são
    iguais em todos os quadros de pergunta. A variação acontece na cor, no tipo de quadro e
    no elemento gráfico — nunca na estrutura.
12. **Português do Brasil correto**, com travessão em vez de hífen solto, e sem
    anglicismo desnecessário (`agenda`, não `schedule`; `horário`, não `slot`, no texto
    voltado ao público).

---

## 10. CRITÉRIO DE APROVAÇÃO

Antes de entregar, verifique cada item e só entregue se todos passarem:

- [ ] Removendo o logo, a sequência **ainda parece a mesma marca** do começo ao fim.
- [ ] Cada peça entrega a ideia em **1,5 segundo** de leitura.
- [ ] Nenhuma peça tem elemento que não sirva à hierarquia.
- [ ] A cor progride ao longo dos 12 quadros — há um arco, não uma repetição.
- [ ] Nenhum quadro repete o mesmo tipo três vezes seguidas.
- [ ] A resposta de cada pergunta é **verdadeira** conforme a seção 1.
- [ ] Todo texto essencial está entre 250 px e 1670 px de altura.
- [ ] Contraste de texto ≥ 4.5:1 em todas as peças.
- [ ] As animações somadas de uma peça terminam em menos de 1,8 s.
- [ ] Uma pessoa que trabalha na Linear olharia essa sequência e **não a chamaria de post de
      marketing**.

---

## 11. COMO RESPONDER

Entregue nesta ordem, sem preâmbulo e sem perguntar nada:

1. **Direção criativa** — 1 parágrafo: o conceito que você fixou e por que ele é o certo
   para esta marca.
2. **Mapa da sequência** — a tabela dos 12 quadros.
3. **As 12 fichas completas**, no formato da seção 7.
4. **Mini design system da campanha.**
5. **O arquivo HTML + CSS** com os 12 artboards.

Escreva como diretor de arte apresentando trabalho a um cliente que entende de design:
afirmativo, específico, sem justificar excessivamente e sem elogiar o próprio trabalho.
