# Página de contato + Resend como camada de e-mail

Data: 2026-07-28

## Problema

Dois problemas ligados pelo mesmo canal:

1. Não existe forma de um interessado falar comigo (superadmin). A landing termina
   na tabela de preços e o visitante não tem próximo passo além de criar conta.
2. O envio de e-mail hoje é `nodemailer` sobre SMTP, com fallback Ethereal em
   desenvolvimento. Só os convites usam. O `.env.example` promete "confirmação de
   reserva" que nunca foi implementada, e cada template repete HTML inline solto.

## Objetivo

Uma página `/contato` que dê motivo para o visitante escrever, e uma camada de
e-mail única sobre o Resend que atenda convites, contato e confirmação de reserva.

## Decisões

| Decisão | Escolha | Motivo |
|---|---|---|
| Destino da mensagem | Banco + e-mail + tela no dashboard | Se o envio falhar, a mensagem continua existindo. |
| Migração do provedor | SDK do Resend com fallback de console em dev | Mantém a interface `sendMail`, não exige credencial para rodar local. |
| Anti-spam | Honeypot + rate limit em memória | Não adiciona dependência nem serviço externo. |
| Escopo de e-mails | Contato, auto-resposta, confirmação de reserva, layout comum | Fecha a dívida do `.env.example` no mesmo trabalho. |

## Arquitetura

### Camada de e-mail

`server/src/lib/mailer.ts` passa a usar o SDK `resend`. A assinatura pública não
muda além de um campo novo:

```ts
interface SendMailInput {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}

export async function sendMail(input: SendMailInput): Promise<void>;
```

Sem `RESEND_API_KEY`, o mailer não envia nada: imprime destinatário, assunto e
qualquer link do corpo no console. É o modo de desenvolvimento. `nodemailer` e
`@types/nodemailer` saem do `package.json`.

`server/src/lib/emailLayout.ts` expõe `renderEmail({ heading, bodyHtml, cta? })`,
que devolve o HTML completo: header com "Time Flow", corpo, botão opcional e
footer. Table-safe, sem CSS externo, paleta indigo da landing.

Os templates ficam em `server/src/lib/emails/`:

- `invite.ts` — os dois convites de hoje, movidos de `lib/inviteEmail.ts` e
  reescritos sobre o layout.
- `contact.ts` — notificação para o superadmin e auto-resposta para o lead.
- `bookingConfirmation.ts` — confirmação para o cliente.

Falha de envio nunca derruba a requisição: quem chama `sendMail` trata o erro e
segue. Uma reserva confirmada continua confirmada se o e-mail não sair.

### Variáveis de ambiente

Adicionadas ao `env.ts` e ao `.env.example`:

- `RESEND_API_KEY` — opcional. Ausente, o mailer entra em modo console.
- `MAIL_FROM` — remetente. Default `"Time Flow" <no-reply@timeflow.com>`.
- `CONTACT_INBOX` — opcional. Destino das notificações de contato. Ausente, o
  serviço busca o e-mail do usuário com role `SUPERADMIN` no banco. Se não houver
  nenhum, registra aviso no log — a mensagem já está persistida.

`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER` e `SMTP_PASS` são removidos do
`.env.example`.

### Modelo de dados

```prisma
enum ContactStatus {
  NEW
  READ
  ARCHIVED
}

model ContactMessage {
  id           Int           @id @default(autoincrement())
  name         String
  email        String
  phone        String?
  businessName String?
  teamSize     String?
  message      String
  status       ContactStatus @default(NEW)
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt

  @@index([status, createdAt])
}
```

`teamSize` é `String` e não `Int` porque a resposta no formulário é uma faixa
("1", "2 a 5", "6 ou mais"), não uma contagem exata.

Migration nova, aditiva: cria enum e tabela, não toca em nada existente.

### API

Pública, em `publicRoutes.ts` (arquivo já separado de propósito para o limite
público ficar visível):

```
POST /public/contact
```

Corpo com `additionalProperties: false` e limite de tamanho em todo campo:
`name` (1–80), `email` (format email, ≤120), `phone` (≤20, opcional),
`businessName` (≤80, opcional), `teamSize` (enum `1` | `2-5` | `6+`, opcional),
`message` (1–2000), `website` (≤200, opcional — honeypot; o schema aceita o campo
preenchido de propósito, a rejeição acontece na regra, não na validação).

Autenticadas, só `SUPERADMIN`:

```
GET   /contact-messages
PATCH /contact-messages/:id     body: { status: ContactStatus }
```

Estrutura seguindo o padrão do projeto: `contactController` → `contactService` →
`contactRepository`, com regras puras em `services/contactRules.ts`.

### Anti-spam

Duas camadas, sem dependência nova:

1. Honeypot: campo `website` escondido no formulário. Preenchido significa bot —
   a API responde 201 sem persistir nem enviar, para o bot não aprender.
2. Rate limit em memória: 3 envios por IP por hora. Estourou, responde 429. Como
   é em memória, reinício do processo zera a janela; é aceitável para o volume
   atual e não introduz Redis.

Ambas moram em `contactRules.ts` como funções puras, testadas em
`contactRules.test.ts` com `node:test`.

### Fluxo do envio

1. Fastify valida o schema.
2. Honeypot e rate limit.
3. Persiste `ContactMessage` com status `NEW`.
4. Notifica o superadmin, com `replyTo` no e-mail do lead.
5. Auto-resposta para o lead.
6. Responde 201.

Os passos 4 e 5 rodam depois da persistência e não afetam a resposta: erro neles
vira log.

### Frontend

`web/app/contato/page.tsx` (server component) mais `contact-form.tsx` (client).
Reusa `LandingHeader`. A nav ganha o item "Contato" e a landing ganha um CTA no
fim da seção de preços apontando para a página.

Layout: hero curto com promessa concreta de tempo de resposta, depois duas
colunas — formulário em card à esquerda, e à direita o que acontece depois do
envio, FAQ de três itens e canais alternativos. O estado de sucesso substitui o
formulário no lugar, sem redirect. Paleta indigo da landing, componentes shadcn
já presentes no projeto.

Erros de validação aparecem por campo. O 429 vira uma mensagem específica de
"muitas tentativas, tente mais tarde", não um erro genérico.

### Caixa de entrada no dashboard

`web/app/dashboard/contatos/page.tsx`, visível só para `SUPERADMIN` (mesmo padrão
de guarda de role já usado no `layout.tsx`). Lista as mensagens mais recentes
primeiro, com status, e permite marcar como lida ou arquivada.

### Confirmação de reserva

Nos dois caminhos de criação de reserva — `publicBookingService` e
`internalBookingService` — quando `clientEmail` existir, envia a confirmação com
negócio, serviço, profissional, data, horário e endereço. O `clientEmail` já é
opcional no modelo `Booking`; sem ele, nada acontece.

## Testes

- `contactRules.test.ts`: honeypot, janela do rate limit, normalização de entrada.
- Teste do mailer em modo console: `sendMail` sem `RESEND_API_KEY` não lança.
- Os testes existentes de convite continuam passando sem alteração, já que a
  assinatura de `sendMail` foi preservada.

## Fora de escopo

- Responder o lead pelo dashboard. A resposta acontece no e-mail, via `replyTo`.
- Webhooks do Resend (bounce, entrega).
- Rate limit distribuído.
