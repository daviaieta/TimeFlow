# Página de contato + Resend — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar uma página `/contato` que converta visitantes em conversas com o superadmin, apoiada numa camada de e-mail única sobre o Resend que atende convites, contato e confirmação de reserva.

**Architecture:** O `sendMail` vira uma factory (`createMailer`) sobre o SDK do Resend, com modo console quando não há `RESEND_API_KEY` — isso mantém a assinatura usada hoje pelos convites e torna o mailer testável sem credencial. Todos os templates passam por um layout HTML comum. O contato é persistido em `ContactMessage` antes de qualquer envio, exposto por uma rota pública com honeypot e rate limit em memória, e lido numa tela do dashboard restrita a SUPERADMIN.

**Tech Stack:** Fastify 5, Prisma 6, Postgres, `resend` (novo), Next 16 (App Router), Tailwind 4, shadcn/base-ui, `node:test` para testes nos dois lados.

## Global Constraints

- Spec de referência: `docs/superpowers/specs/2026-07-28-contato-e-resend-design.md`.
- Todo texto visível ao usuário em português do Brasil.
- Todo schema de rota Fastify usa `additionalProperties: false` e `maxLength` em campos de texto.
- Nenhuma dependência nova além de `resend` no server. `nodemailer` e `@types/nodemailer` são removidos.
- Testes de server: `cd server && npm test`. Testes de web: `cd web && npm test`. Typecheck: `npm run typecheck` em cada pacote.
- Testes ficam ao lado do arquivo testado (`x.ts` + `x.test.ts`), usando `node:test` e `node:assert/strict` — padrão já usado no repositório.
- Regra de negócio pura vive em `services/*Rules.ts` (server) ou `lib/*.ts` (web) e é testada; controller e repositório não recebem testes.
- Nenhuma falha de envio de e-mail pode derrubar uma requisição ou desfazer uma escrita já feita.
- Todo conteúdo vindo do usuário que entra em HTML de e-mail passa por `escapeHtml`.
- Mensagens de commit em inglês, tipo convencional (`feat:`, `refactor:`, `chore:`).

---

### Task 1: Mailer sobre Resend + layout de e-mail

**Files:**
- Modify: `server/package.json` (adiciona `resend`, remove `nodemailer` e `@types/nodemailer`)
- Modify: `server/src/config/env.ts`
- Modify: `server/.env.example`
- Rewrite: `server/src/lib/mailer.ts`
- Create: `server/src/lib/mailer.test.ts`
- Create: `server/src/lib/emailLayout.ts`
- Create: `server/src/lib/emailLayout.test.ts`

**Interfaces:**
- Consumes: `env` de `server/src/config/env.ts`.
- Produces:
  - `sendMail(input: SendMailInput): Promise<void>` e `createMailer(config: MailerConfig): (input: SendMailInput) => Promise<void>` em `lib/mailer.ts`, com `interface SendMailInput { to: string; subject: string; html: string; replyTo?: string }`.
  - `renderEmail(input: EmailLayoutInput): string` e `escapeHtml(value: string): string` em `lib/emailLayout.ts`.
  - `env.resendApiKey: string | null`, `env.mailFrom: string`, `env.contactInbox: string | null`.

- [ ] **Step 1: Instalar o SDK e remover o nodemailer**

```bash
cd server
npm install resend
npm uninstall nodemailer @types/nodemailer
```

- [ ] **Step 2: Escrever o teste do layout de e-mail**

Criar `server/src/lib/emailLayout.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { escapeHtml, renderEmail } from "./emailLayout";

test("renderEmail coloca título, corpo e CTA no HTML", () => {
  const html = renderEmail({
    heading: "Olá, Zé!",
    bodyHtml: "<p>Sua reserva está confirmada.</p>",
    cta: { label: "Ver detalhes", url: "https://timeflow.app/x" },
  });

  assert.ok(html.includes("Olá, Zé!"));
  assert.ok(html.includes("Sua reserva está confirmada."));
  assert.ok(html.includes("https://timeflow.app/x"));
  assert.ok(html.includes("Ver detalhes"));
});

test("renderEmail omite o botão quando não há CTA", () => {
  const html = renderEmail({ heading: "Oi", bodyHtml: "<p>corpo</p>" });

  assert.ok(!html.includes("<a"));
});

test("renderEmail inclui a nota de rodapé quando informada", () => {
  const html = renderEmail({
    heading: "Oi",
    bodyHtml: "<p>corpo</p>",
    footnote: "O link expira em 48 horas.",
  });

  assert.ok(html.includes("O link expira em 48 horas."));
});

// Conteúdo de contato é digitado por desconhecido e entra no corpo do e-mail:
// sem escape, uma mensagem com <script> ou uma tag aberta quebraria o HTML.
test("escapeHtml neutraliza os caracteres de marcação", () => {
  assert.equal(
    escapeHtml('<script>alert("x")</script>'),
    "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;",
  );
  assert.equal(escapeHtml("Zé & Cia"), "Zé &amp; Cia");
});
```

- [ ] **Step 3: Rodar o teste e ver falhar**

Run: `cd server && npx tsx --test src/lib/emailLayout.test.ts`
Expected: FAIL — `Cannot find module './emailLayout'`

- [ ] **Step 4: Implementar o layout**

Criar `server/src/lib/emailLayout.ts`:

```ts
// Layout único de todos os e-mails transacionais. HTML em tabela e estilo
// inline de propósito: cliente de e-mail ignora <style> externo e flexbox.
interface EmailLayoutInput {
  heading: string;
  bodyHtml: string;
  cta?: { label: string; url: string };
  footnote?: string;
}

const INDIGO = "#4338ca";

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderEmail({ heading, bodyHtml, cta, footnote }: EmailLayoutInput): string {
  const ctaHtml = cta
    ? `<p style="margin: 24px 0;">
         <a href="${cta.url}" style="display: inline-block; background: ${INDIGO}; color: #ffffff; padding: 12px 24px; border-radius: 9999px; text-decoration: none; font-weight: 500;">${cta.label}</a>
       </p>`
    : "";

  const footnoteHtml = footnote
    ? `<p style="margin: 24px 0 0; color: #71717a; font-size: 13px;">${footnote}</p>`
    : "";

  return `<!doctype html>
<html lang="pt-BR">
  <body style="margin: 0; padding: 24px; background: #f4f4f5; font-family: -apple-system, Segoe UI, Roboto, sans-serif; color: #18181b;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden;">
      <tr>
        <td style="background: ${INDIGO}; padding: 20px 32px; color: #ffffff; font-size: 18px; font-weight: 600;">Time Flow</td>
      </tr>
      <tr>
        <td style="padding: 32px;">
          <h1 style="margin: 0 0 16px; font-size: 20px; font-weight: 600;">${heading}</h1>
          ${bodyHtml}
          ${ctaHtml}
          ${footnoteHtml}
        </td>
      </tr>
      <tr>
        <td style="padding: 20px 32px; background: #fafafa; color: #a1a1aa; font-size: 12px;">
          Time Flow — sua agenda online, sem conflito de horário.
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
```

- [ ] **Step 5: Rodar o teste do layout**

Run: `cd server && npx tsx --test src/lib/emailLayout.test.ts`
Expected: PASS (4 testes)

- [ ] **Step 6: Escrever o teste do mailer**

Criar `server/src/lib/mailer.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { createMailer } from "./mailer";

function fakeLogger() {
  const lines: string[] = [];
  return {
    lines,
    log: (message: string) => lines.push(message),
    error: (message: string) => lines.push(message),
  };
}

// Sem credencial (dev), enviar não pode explodir: o convite continua sendo
// criado e o link precisa aparecer no console para reenvio manual.
test("sem apiKey, o mailer não envia e imprime destinatário e links", async () => {
  const logger = fakeLogger();
  const send = createMailer({ apiKey: null, from: "Time Flow <x@y.com>", logger });

  await send({
    to: "ze@exemplo.com",
    subject: "Convite",
    html: '<a href="https://timeflow.app/accept-invite?token=abc">Definir senha</a>',
  });

  const output = logger.lines.join("\n");
  assert.ok(output.includes("ze@exemplo.com"));
  assert.ok(output.includes("Convite"));
  assert.ok(output.includes("https://timeflow.app/accept-invite?token=abc"));
});

test("sem apiKey e sem links no corpo, ainda não lança", async () => {
  const logger = fakeLogger();
  const send = createMailer({ apiKey: null, from: "Time Flow <x@y.com>", logger });

  await send({ to: "ze@exemplo.com", subject: "Oi", html: "<p>sem link</p>" });

  assert.equal(logger.lines.length, 1);
});
```

- [ ] **Step 7: Rodar o teste e ver falhar**

Run: `cd server && npx tsx --test src/lib/mailer.test.ts`
Expected: FAIL — `createMailer is not a function` (ou módulo não encontrado, dependendo do estado do arquivo)

- [ ] **Step 8: Reescrever o mailer sobre o Resend**

Substituir todo o conteúdo de `server/src/lib/mailer.ts`:

```ts
import { Resend } from "resend";
import { env } from "../config/env";

export interface SendMailInput {
  to: string;
  subject: string;
  html: string;
  // Notificação de contato usa isto para "Responder" cair direto no lead.
  replyTo?: string;
}

interface MailerConfig {
  apiKey: string | null;
  from: string;
  logger?: Pick<Console, "log" | "error">;
}

// Fábrica em vez de função solta: é o que permite testar o modo console sem
// credencial e sem tocar em process.env dentro do teste.
export function createMailer(config: MailerConfig) {
  const logger = config.logger ?? console;
  const client = config.apiKey ? new Resend(config.apiKey) : null;

  return async function send(input: SendMailInput): Promise<void> {
    if (!client) {
      // Modo desenvolvimento: nada sai da máquina. O corpo inteiro polui o
      // terminal, então só o cabeçalho e os links vão para o log.
      logger.log(`[mailer] modo console — para: ${input.to} | assunto: ${input.subject}`);
      for (const link of extractLinks(input.html)) {
        logger.log(`[mailer] link: ${link}`);
      }
      return;
    }

    const { error } = await client.emails.send({
      from: config.from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      ...(input.replyTo ? { replyTo: input.replyTo } : {}),
    });

    // O SDK devolve o erro no retorno em vez de lançar: sem esta checagem, um
    // envio recusado passaria por bem-sucedido.
    if (error) {
      throw new Error(`Resend recusou o envio: ${error.message}`);
    }
  };
}

function extractLinks(html: string): string[] {
  return [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
}

export const sendMail = createMailer({
  apiKey: env.resendApiKey,
  from: env.mailFrom,
});
```

- [ ] **Step 9: Adicionar as variáveis ao env**

Em `server/src/config/env.ts`, dentro do objeto `env` exportado, adicionar:

```ts
  // Sem chave, o mailer entra em modo console: nada é enviado de verdade.
  resendApiKey: process.env.RESEND_API_KEY ?? null,
  mailFrom: process.env.MAIL_FROM ?? '"Time Flow" <no-reply@timeflow.com>',
  // Destino das notificações de contato. Sem valor, o serviço cai no e-mail
  // do SUPERADMIN cadastrado no banco.
  contactInbox: process.env.CONTACT_INBOX ?? null,
```

- [ ] **Step 10: Atualizar o `.env.example`**

Em `server/.env.example`, remover o bloco `SMTP_*`/`MAIL_FROM` inteiro (do comentário "SMTP dos e-mails transacionais" até a linha `# MAIL_FROM=...`) e colocar no lugar:

```bash
# Resend — e-mails transacionais (convites, contato, confirmação de reserva).
# Sem RESEND_API_KEY, o mailer entra em modo console: imprime destinatário,
# assunto e links no terminal e não entrega nada.
# RESEND_API_KEY=""
# MAIL_FROM="\"Time Flow\" <no-reply@seudominio.com>"

# Destino das mensagens do formulário de contato da landing. Sem valor, cai
# no e-mail do usuário SUPERADMIN cadastrado no banco.
# CONTACT_INBOX=""
```

- [ ] **Step 11: Rodar os testes e o typecheck**

Run: `cd server && npm test && npm run typecheck`
Expected: PASS — nenhum teste falhando, nenhum erro de tipo. `lib/inviteEmail.ts` continua compilando porque a assinatura de `sendMail` não mudou.

- [ ] **Step 12: Commit**

```bash
git add server/package.json server/package-lock.json server/.env.example server/src/config/env.ts server/src/lib/mailer.ts server/src/lib/mailer.test.ts server/src/lib/emailLayout.ts server/src/lib/emailLayout.test.ts
git commit -m "feat(server): replace nodemailer with Resend and add shared email layout"
```

---

### Task 2: Migrar os convites para o layout comum

**Files:**
- Create: `server/src/lib/emails/invite.ts`
- Delete: `server/src/lib/inviteEmail.ts`
- Modify: `server/src/services/businessService.ts:5` (import)
- Modify: `server/src/services/employeeService.ts:4` (import)

**Interfaces:**
- Consumes: `renderEmail`, `escapeHtml` (Task 1), `sendMail` (Task 1).
- Produces: `sendInviteEmail(input: InviteEmailInput): Promise<void>` e `sendEmployeeInviteEmail(input: EmployeeInviteEmailInput): Promise<void>` em `lib/emails/invite.ts` — mesmos nomes e mesmos campos de hoje.

- [ ] **Step 1: Criar os templates sobre o layout**

Criar `server/src/lib/emails/invite.ts`:

```ts
import { escapeHtml, renderEmail } from "../emailLayout";
import { sendMail } from "../mailer";

interface InviteEmailInput {
  to: string;
  adminName: string;
  businessName: string;
  inviteLink: string;
}

const EXPIRY_NOTE =
  "O link expira em 48 horas. Se você não esperava este convite, ignore este e-mail.";

export function sendInviteEmail(input: InviteEmailInput): Promise<void> {
  const { to, adminName, businessName, inviteLink } = input;

  return sendMail({
    to,
    subject: `Você foi convidado para gerenciar ${businessName} no Time Flow`,
    html: renderEmail({
      heading: `Olá, ${escapeHtml(adminName)}!`,
      bodyHtml: `
        <p style="margin: 0 0 12px;">
          Você foi convidado para administrar <strong>${escapeHtml(businessName)}</strong> no Time Flow.
        </p>
        <p style="margin: 0;">Para ativar sua conta, defina sua senha pelo link abaixo:</p>
      `,
      cta: { label: "Definir minha senha", url: inviteLink },
      footnote: EXPIRY_NOTE,
    }),
  });
}

interface EmployeeInviteEmailInput {
  to: string;
  employeeName: string;
  businessName: string;
  inviteLink: string;
}

export function sendEmployeeInviteEmail(input: EmployeeInviteEmailInput): Promise<void> {
  const { to, employeeName, businessName, inviteLink } = input;

  return sendMail({
    to,
    subject: `Você foi convidado para a equipe de ${businessName} no Time Flow`,
    html: renderEmail({
      heading: `Olá, ${escapeHtml(employeeName)}!`,
      bodyHtml: `
        <p style="margin: 0 0 12px;">
          Você foi convidado para fazer parte da equipe de <strong>${escapeHtml(businessName)}</strong> no Time Flow.
        </p>
        <p style="margin: 0;">Para ativar sua conta, defina sua senha pelo link abaixo:</p>
      `,
      cta: { label: "Definir minha senha", url: inviteLink },
      footnote: EXPIRY_NOTE,
    }),
  });
}
```

- [ ] **Step 2: Apagar o arquivo antigo e apontar os imports**

```bash
rm server/src/lib/inviteEmail.ts
```

Em `server/src/services/businessService.ts`, trocar a linha 5 por:

```ts
import { sendEmployeeInviteEmail, sendInviteEmail } from "../lib/emails/invite";
```

Em `server/src/services/employeeService.ts`, trocar a linha 4 por:

```ts
import { sendEmployeeInviteEmail } from "../lib/emails/invite";
```

- [ ] **Step 3: Verificar que nada mais referencia o módulo antigo**

Run: `cd server && grep -rn "lib/inviteEmail" src/ || echo "sem referências"`
Expected: `sem referências`

- [ ] **Step 4: Rodar testes e typecheck**

Run: `cd server && npm test && npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/emails/invite.ts server/src/lib/inviteEmail.ts server/src/services/businessService.ts server/src/services/employeeService.ts
git commit -m "refactor(server): move invite emails to shared layout"
```

---

### Task 3: Modelo ContactMessage e repositório

**Files:**
- Modify: `server/prisma/schema.prisma`
- Create: `server/prisma/migrations/<timestamp>_add_contact_message/migration.sql` (gerada pelo Prisma)
- Create: `server/src/repositories/contactRepository.ts`

**Interfaces:**
- Consumes: `prisma` de `server/src/lib/prisma.ts`.
- Produces:
  - Modelo Prisma `ContactMessage` e enum `ContactStatus` (`NEW` | `READ` | `ARCHIVED`).
  - `contactRepository.create(input: CreateContactInput): Promise<ContactMessage>` com `interface CreateContactInput { name: string; email: string; phone: string | null; businessName: string | null; teamSize: string | null; message: string }`.
  - `contactRepository.findAll(): Promise<ContactMessage[]>`
  - `contactRepository.findById(id: number): Promise<ContactMessage | null>`
  - `contactRepository.updateStatus(id: number, status: ContactStatus): Promise<ContactMessage>`

- [ ] **Step 1: Declarar o modelo no schema**

Em `server/prisma/schema.prisma`, adicionar o enum junto dos outros enums (depois de `BookingSource`) e o modelo ao final do arquivo:

```prisma
enum ContactStatus {
  NEW
  READ
  ARCHIVED
}

// Mensagens do formulário público da landing. Sem relação com Business: quem
// escreve ainda não é cliente — é justamente esse o ponto do formulário.
model ContactMessage {
  id           Int           @id @default(autoincrement())
  name         String
  email        String
  phone        String?
  // Faixa ("1", "2-5", "6+"), não contagem exata: é o que o formulário pergunta.
  teamSize     String?
  businessName String?
  message      String
  status       ContactStatus @default(NEW)
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt

  @@index([status, createdAt])
}
```

- [ ] **Step 2: Gerar a migration**

Run: `cd server && npx prisma migrate dev --name add_contact_message`
Expected: cria `prisma/migrations/<timestamp>_add_contact_message/`, aplica no banco local e roda `prisma generate`.

- [ ] **Step 3: Conferir que a migration é puramente aditiva**

Run: `cd server && cat prisma/migrations/*_add_contact_message/migration.sql`
Expected: só `CREATE TYPE "ContactStatus"`, `CREATE TABLE "ContactMessage"` e `CREATE INDEX`. Nenhum `DROP` ou `ALTER` em tabela existente. Se aparecer qualquer coisa fora disso, pare e investigue antes de seguir.

- [ ] **Step 4: Criar o repositório**

Criar `server/src/repositories/contactRepository.ts`:

```ts
import { ContactMessage, ContactStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";

interface CreateContactInput {
  name: string;
  email: string;
  phone: string | null;
  businessName: string | null;
  teamSize: string | null;
  message: string;
}

export const contactRepository = {
  create(input: CreateContactInput): Promise<ContactMessage> {
    return prisma.contactMessage.create({ data: input });
  },

  // Novas primeiro: a caixa é lida de cima para baixo.
  findAll(): Promise<ContactMessage[]> {
    return prisma.contactMessage.findMany({ orderBy: { createdAt: "desc" } });
  },

  findById(id: number): Promise<ContactMessage | null> {
    return prisma.contactMessage.findUnique({ where: { id } });
  },

  updateStatus(id: number, status: ContactStatus): Promise<ContactMessage> {
    return prisma.contactMessage.update({ where: { id }, data: { status } });
  },
};
```

- [ ] **Step 5: Typecheck**

Run: `cd server && npm run typecheck`
Expected: PASS — se falhar com "Property 'contactMessage' does not exist", rode `npx prisma generate` e repita.

- [ ] **Step 6: Commit**

```bash
git add server/prisma/schema.prisma server/prisma/migrations server/src/repositories/contactRepository.ts
git commit -m "feat(server): add ContactMessage model and repository"
```

---

### Task 4: Regras de contato (honeypot, rate limit, normalização)

**Files:**
- Create: `server/src/services/contactRules.ts`
- Create: `server/src/services/contactRules.test.ts`

**Interfaces:**
- Consumes: nada — módulo puro, sem I/O.
- Produces:
  - `interface ContactInput { name: string; email: string; phone?: string; businessName?: string; teamSize?: string; message: string; website?: string }`
  - `interface NormalizedContact { name: string; email: string; phone: string | null; businessName: string | null; teamSize: string | null; message: string }`
  - `isBot(input: Pick<ContactInput, "website">): boolean`
  - `normalizeContact(input: ContactInput): NormalizedContact`
  - `withinWindow(timestamps: number[], now: number, windowMs: number): number[]`
  - `isRateLimited(timestamps: number[], now: number, options: { windowMs: number; max: number }): boolean`
  - `CONTACT_RATE_LIMIT: { windowMs: number; max: number }`

- [ ] **Step 1: Escrever os testes**

Criar `server/src/services/contactRules.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CONTACT_RATE_LIMIT,
  isBot,
  isRateLimited,
  normalizeContact,
  withinWindow,
} from "./contactRules";

const HOUR = 60 * 60 * 1000;

test("honeypot preenchido é bot", () => {
  assert.equal(isBot({ website: "http://spam.example" }), true);
});

test("honeypot vazio, ausente ou só espaço é humano", () => {
  assert.equal(isBot({ website: "" }), false);
  assert.equal(isBot({ website: "   " }), false);
  assert.equal(isBot({}), false);
});

test("normalizeContact apara espaços e baixa o e-mail", () => {
  const result = normalizeContact({
    name: "  Zé da Silva ",
    email: "  ZE@Exemplo.COM ",
    phone: " 11 99999-0000 ",
    businessName: " Barbearia Old Brothers ",
    teamSize: "2-5",
    message: "  Quero saber dos planos.  ",
  });

  assert.deepEqual(result, {
    name: "Zé da Silva",
    email: "ze@exemplo.com",
    phone: "11 99999-0000",
    businessName: "Barbearia Old Brothers",
    teamSize: "2-5",
    message: "Quero saber dos planos.",
  });
});

// Campo opcional em branco vira null, não string vazia: no banco, "sem
// telefone" e "telefone vazio" precisam ser a mesma coisa.
test("normalizeContact transforma opcional em branco em null", () => {
  const result = normalizeContact({
    name: "Zé",
    email: "ze@exemplo.com",
    phone: "   ",
    message: "oi",
  });

  assert.equal(result.phone, null);
  assert.equal(result.businessName, null);
  assert.equal(result.teamSize, null);
});

test("withinWindow descarta o que é mais velho que a janela", () => {
  const now = 10 * HOUR;
  const timestamps = [now - 2 * HOUR, now - 30 * 60 * 1000, now];

  assert.deepEqual(withinWindow(timestamps, now, HOUR), [
    now - 30 * 60 * 1000,
    now,
  ]);
});

test("isRateLimited só bloqueia ao atingir o máximo dentro da janela", () => {
  const now = 10 * HOUR;
  const options = { windowMs: HOUR, max: 3 };

  assert.equal(isRateLimited([now, now], now, options), false);
  assert.equal(isRateLimited([now, now, now], now, options), true);
  // Três envios, mas velhos: a janela já passou, não bloqueia.
  const old = now - 2 * HOUR;
  assert.equal(isRateLimited([old, old, old], now, options), false);
});

test("o limite padrão é 3 por hora", () => {
  assert.deepEqual(CONTACT_RATE_LIMIT, { windowMs: HOUR, max: 3 });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd server && npx tsx --test src/services/contactRules.test.ts`
Expected: FAIL — `Cannot find module './contactRules'`

- [ ] **Step 3: Implementar as regras**

Criar `server/src/services/contactRules.ts`:

```ts
export interface ContactInput {
  name: string;
  email: string;
  phone?: string;
  businessName?: string;
  teamSize?: string;
  message: string;
  // Campo escondido no formulário. Humano nunca preenche; bot que varre
  // inputs, sim.
  website?: string;
}

export interface NormalizedContact {
  name: string;
  email: string;
  phone: string | null;
  businessName: string | null;
  teamSize: string | null;
  message: string;
}

export const CONTACT_RATE_LIMIT = { windowMs: 60 * 60 * 1000, max: 3 };

export function isBot(input: Pick<ContactInput, "website">): boolean {
  return Boolean(input.website?.trim());
}

function optional(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function normalizeContact(input: ContactInput): NormalizedContact {
  return {
    name: input.name.trim(),
    email: input.email.trim().toLowerCase(),
    phone: optional(input.phone),
    businessName: optional(input.businessName),
    teamSize: optional(input.teamSize),
    message: input.message.trim(),
  };
}

export function withinWindow(
  timestamps: number[],
  now: number,
  windowMs: number,
): number[] {
  return timestamps.filter((timestamp) => now - timestamp < windowMs);
}

export function isRateLimited(
  timestamps: number[],
  now: number,
  options: { windowMs: number; max: number },
): boolean {
  return withinWindow(timestamps, now, options.windowMs).length >= options.max;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd server && npx tsx --test src/services/contactRules.test.ts`
Expected: PASS (7 testes)

- [ ] **Step 5: Commit**

```bash
git add server/src/services/contactRules.ts server/src/services/contactRules.test.ts
git commit -m "feat(server): add contact form rules with honeypot and rate limit"
```

---

### Task 5: Envio do contato — serviço, templates, rota pública

**Files:**
- Create: `server/src/lib/emails/contact.ts`
- Create: `server/src/services/contactService.ts`
- Create: `server/src/controllers/contactController.ts`
- Modify: `server/src/routes/publicRoutes.ts`

**Interfaces:**
- Consumes: `contactRepository` (Task 3), `contactRules` (Task 4), `renderEmail`/`escapeHtml` (Task 1), `sendMail` (Task 1), `env.contactInbox` (Task 1), `userRepository` de `server/src/repositories/userRepository.ts`, `TooManyRequestsError` (criado aqui).
- Produces:
  - `sendContactNotificationEmail(input: ContactNotificationInput): Promise<void>` e `sendContactAutoReplyEmail(input: ContactAutoReplyInput): Promise<void>` em `lib/emails/contact.ts`.
  - `contactService.submit(input: ContactInput, ip: string, now: Date): Promise<void>`
  - `contactService.list()` e `contactService.setStatus(id, status)` (usados na Task 6).
  - `createContactMessage` (controller) e a rota `POST /public/contact`.
  - `TooManyRequestsError` em `server/src/lib/errors.ts`.

- [ ] **Step 1: Adicionar o erro 429**

Ao final de `server/src/lib/errors.ts`:

```ts
export class TooManyRequestsError extends AppError {
  constructor(message = "Too many requests") {
    super(message, 429);
  }
}
```

- [ ] **Step 2: Criar os dois templates de contato**

Criar `server/src/lib/emails/contact.ts`:

```ts
import { escapeHtml, renderEmail } from "../emailLayout";
import { sendMail } from "../mailer";

interface ContactNotificationInput {
  to: string;
  name: string;
  email: string;
  phone: string | null;
  businessName: string | null;
  teamSize: string | null;
  message: string;
}

function row(label: string, value: string | null): string {
  if (!value) return "";
  return `<p style="margin: 0 0 8px;"><strong>${label}:</strong> ${escapeHtml(value)}</p>`;
}

export function sendContactNotificationEmail(
  input: ContactNotificationInput,
): Promise<void> {
  return sendMail({
    to: input.to,
    // replyTo no lead: responder no cliente de e-mail já cai na pessoa certa,
    // sem copiar endereço à mão.
    replyTo: input.email,
    subject: `Novo contato pelo site: ${input.name}`,
    html: renderEmail({
      heading: "Novo contato pelo site",
      bodyHtml: `
        ${row("Nome", input.name)}
        ${row("E-mail", input.email)}
        ${row("WhatsApp", input.phone)}
        ${row("Negócio", input.businessName)}
        ${row("Profissionais", input.teamSize)}
        <p style="margin: 16px 0 4px;"><strong>Mensagem:</strong></p>
        <p style="margin: 0; white-space: pre-wrap;">${escapeHtml(input.message)}</p>
      `,
      footnote: "Responder este e-mail vai direto para quem escreveu.",
    }),
  });
}

interface ContactAutoReplyInput {
  to: string;
  name: string;
}

export function sendContactAutoReplyEmail(
  input: ContactAutoReplyInput,
): Promise<void> {
  return sendMail({
    to: input.to,
    subject: "Recebemos sua mensagem — Time Flow",
    html: renderEmail({
      heading: `Olá, ${escapeHtml(input.name)}!`,
      bodyHtml: `
        <p style="margin: 0 0 12px;">
          Recebi sua mensagem e respondo em até 1 dia útil, pessoalmente.
        </p>
        <p style="margin: 0;">
          Se for urgente, é só responder este e-mail com mais detalhes do seu
          negócio — quanto mais contexto, mais direta fica a resposta.
        </p>
      `,
      footnote: "Este e-mail é automático, mas a resposta não será.",
    }),
  });
}
```

- [ ] **Step 3: Criar o serviço**

Criar `server/src/services/contactService.ts`:

```ts
import { ContactStatus } from "@prisma/client";
import { env } from "../config/env";
import {
  sendContactAutoReplyEmail,
  sendContactNotificationEmail,
} from "../lib/emails/contact";
import { NotFoundError, TooManyRequestsError } from "../lib/errors";
import { contactRepository } from "../repositories/contactRepository";
import { userRepository } from "../repositories/userRepository";
import {
  CONTACT_RATE_LIMIT,
  ContactInput,
  isBot,
  isRateLimited,
  normalizeContact,
  withinWindow,
} from "./contactRules";

// Em memória de propósito: para o volume atual não vale um Redis, e reiniciar
// o processo zerar a janela é aceitável — o honeypot já segura o grosso.
const hitsByIp = new Map<string, number[]>();

async function resolveInbox(): Promise<string | null> {
  if (env.contactInbox) {
    return env.contactInbox;
  }

  const superadmin = await userRepository.findFirstSuperadmin();
  return superadmin?.email ?? null;
}

export const contactService = {
  async submit(input: ContactInput, ip: string, now: Date): Promise<void> {
    // Resposta idêntica à de sucesso: devolver erro ensinaria o bot qual campo
    // o denunciou.
    if (isBot(input)) {
      return;
    }

    const timestamp = now.getTime();
    const previous = hitsByIp.get(ip) ?? [];
    if (isRateLimited(previous, timestamp, CONTACT_RATE_LIMIT)) {
      throw new TooManyRequestsError(
        "Muitas mensagens em pouco tempo. Tente novamente mais tarde.",
      );
    }
    hitsByIp.set(ip, [
      ...withinWindow(previous, timestamp, CONTACT_RATE_LIMIT.windowMs),
      timestamp,
    ]);

    const contact = normalizeContact(input);

    // Persiste antes de enviar: e-mail que não sai vira log, mensagem que não
    // é salva some para sempre.
    await contactRepository.create(contact);

    const inbox = await resolveInbox();
    if (!inbox) {
      console.error(
        "Contato recebido sem destino: defina CONTACT_INBOX ou cadastre um SUPERADMIN.",
      );
    }

    try {
      if (inbox) {
        await sendContactNotificationEmail({ to: inbox, ...contact });
      }
      await sendContactAutoReplyEmail({ to: contact.email, name: contact.name });
    } catch (error) {
      // A mensagem já está no banco e aparece na caixa do dashboard: falha de
      // envio não pode virar erro para quem preencheu o formulário.
      console.error(`Falha ao enviar e-mails do contato de ${contact.email}:`, error);
    }
  },

  list() {
    return contactRepository.findAll();
  },

  async setStatus(id: number, status: ContactStatus) {
    const message = await contactRepository.findById(id);
    if (!message) {
      throw new NotFoundError("Contact message not found");
    }

    return contactRepository.updateStatus(id, status);
  },
};
```

- [ ] **Step 4: Adicionar a busca do superadmin ao userRepository**

Em `server/src/repositories/userRepository.ts`, adicionar ao objeto exportado:

```ts
  // Fallback do destino de contato quando CONTACT_INBOX não está definida.
  findFirstSuperadmin() {
    return prisma.user.findFirst({
      where: { role: Role.SUPERADMIN },
      orderBy: { id: "asc" },
      select: { email: true },
    });
  },
```

Se `Role` ainda não estiver importado no arquivo, adicione `import { Role } from "@prisma/client";` no topo (ou inclua `Role` no import existente de `@prisma/client`).

- [ ] **Step 5: Criar o controller**

Criar `server/src/controllers/contactController.ts`:

```ts
import { ContactStatus } from "@prisma/client";
import { FastifyReply, FastifyRequest } from "fastify";
import { contactService } from "../services/contactService";

export interface ContactBody {
  name: string;
  email: string;
  phone?: string;
  businessName?: string;
  teamSize?: string;
  message: string;
  website?: string;
}

export interface ContactStatusParams {
  id: number;
}

export interface ContactStatusBody {
  status: ContactStatus;
}

export async function createContactMessage(
  request: FastifyRequest<{ Body: ContactBody }>,
  reply: FastifyReply,
): Promise<void> {
  await contactService.submit(request.body, request.ip, new Date());
  reply.status(201).send({ received: true });
}

export async function listContactMessages(
  _request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const messages = await contactService.list();
  reply.send({ messages });
}

export async function updateContactMessageStatus(
  request: FastifyRequest<{ Params: ContactStatusParams; Body: ContactStatusBody }>,
  reply: FastifyReply,
): Promise<void> {
  const message = await contactService.setStatus(
    request.params.id,
    request.body.status,
  );
  reply.send({ message });
}
```

- [ ] **Step 6: Registrar a rota pública**

Em `server/src/routes/publicRoutes.ts`, adicionar o import do controller no bloco de imports:

```ts
import { ContactBody, createContactMessage } from "../controllers/contactController";
```

Adicionar o schema junto dos outros, antes de `export async function publicRoutes`:

```ts
// `website` é o honeypot: aceito no schema de propósito, para o bot receber
// 201 e não descobrir que o campo o denunciou. A rejeição é na regra.
const contactSchema = {
  body: {
    type: "object",
    required: ["name", "email", "message"],
    additionalProperties: false,
    properties: {
      name: { type: "string", minLength: 1, maxLength: 80 },
      email: { type: "string", format: "email", maxLength: 120 },
      phone: { type: "string", maxLength: 20 },
      businessName: { type: "string", maxLength: 80 },
      teamSize: { type: "string", enum: ["1", "2-5", "6+"] },
      message: { type: "string", minLength: 1, maxLength: 2000 },
      website: { type: "string", maxLength: 200 },
    },
  },
};
```

E a rota dentro de `publicRoutes`:

```ts
  app.post<{ Body: ContactBody }>(
    "/public/contact",
    { schema: contactSchema },
    createContactMessage,
  );
```

- [ ] **Step 7: Testar a rota de ponta a ponta**

Suba a API (`cd server && npm run dev`) e, em outro terminal:

```bash
curl -i -X POST http://localhost:3333/public/contact \
  -H "Content-Type: application/json" \
  -d '{"name":"Zé","email":"ze@exemplo.com","message":"Quero conhecer os planos","teamSize":"2-5"}'
```

Expected: `HTTP/1.1 201` com `{"received":true}`. No terminal do servidor, duas linhas `[mailer] modo console` (notificação e auto-resposta), assumindo `RESEND_API_KEY` ausente.

Repita o mesmo `curl` mais três vezes: a quarta chamada dentro da mesma hora deve responder `HTTP/1.1 429`.

Honeypot:

```bash
curl -i -X POST http://localhost:3333/public/contact \
  -H "Content-Type: application/json" \
  -d '{"name":"bot","email":"bot@spam.com","message":"spam","website":"http://spam.com"}'
```

Expected: `HTTP/1.1 201` sem nenhuma linha `[mailer]` no log do servidor.

- [ ] **Step 8: Rodar testes e typecheck**

Run: `cd server && npm test && npm run typecheck`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add server/src/lib/errors.ts server/src/lib/emails/contact.ts server/src/services/contactService.ts server/src/controllers/contactController.ts server/src/repositories/userRepository.ts server/src/routes/publicRoutes.ts
git commit -m "feat(server): accept contact form submissions and notify superadmin"
```

---

### Task 6: Rotas de leitura do contato para o SUPERADMIN

**Files:**
- Create: `server/src/routes/contactRoutes.ts`
- Modify: `server/src/app.ts`

**Interfaces:**
- Consumes: `listContactMessages`, `updateContactMessageStatus`, `ContactStatusParams`, `ContactStatusBody` (Task 5); `authenticate` de `middlewares/authenticate.ts`; `authorize` de `middlewares/authorize.ts`.
- Produces: `contactRoutes(app: FastifyInstance): Promise<void>`, registrando `GET /contact-messages` e `PATCH /contact-messages/:id`.

- [ ] **Step 1: Criar o arquivo de rotas**

Criar `server/src/routes/contactRoutes.ts`:

```ts
import { Role } from "@prisma/client";
import { FastifyInstance } from "fastify";
import {
  ContactStatusBody,
  ContactStatusParams,
  listContactMessages,
  updateContactMessageStatus,
} from "../controllers/contactController";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";

// Caixa de entrada da plataforma: só o dono do produto lê. Sem
// requireActiveSubscription — o SUPERADMIN não tem negócio nem assinatura.
const statusSchema = {
  params: {
    type: "object",
    required: ["id"],
    additionalProperties: false,
    properties: {
      id: { type: "integer" },
    },
  },
  body: {
    type: "object",
    required: ["status"],
    additionalProperties: false,
    properties: {
      status: { type: "string", enum: ["NEW", "READ", "ARCHIVED"] },
    },
  },
};

export async function contactRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", authenticate);
  app.addHook("onRequest", authorize(Role.SUPERADMIN));

  app.get("/contact-messages", listContactMessages);

  app.patch<{ Params: ContactStatusParams; Body: ContactStatusBody }>(
    "/contact-messages/:id",
    { schema: statusSchema },
    updateContactMessageStatus,
  );
}
```

Se os outros arquivos de rotas autenticadas do projeto aplicarem `authenticate` de outra forma (por exemplo `{ onRequest: [authenticate] }` por rota em vez de `addHook`), siga o padrão que já existe em `server/src/routes/businessRoutes.ts` em vez deste.

- [ ] **Step 2: Registrar no app**

Em `server/src/app.ts`, adicionar o import junto dos demais:

```ts
import { contactRoutes } from "./routes/contactRoutes";
```

E o registro dentro de `buildApp`, junto dos outros `app.register`:

```ts
  app.register(contactRoutes);
```

- [ ] **Step 3: Verificar a guarda de role**

Suba a API e rode:

```bash
curl -i http://localhost:3333/contact-messages
```

Expected: `HTTP/1.1 401`.

Faça login como um ADMIN (não superadmin) via `POST /auth/login`, pegue o token e rode:

```bash
curl -i http://localhost:3333/contact-messages -H "Authorization: Bearer <token-de-admin>"
```

Expected: `HTTP/1.1 403`.

Repita com o token do SUPERADMIN do seed: `HTTP/1.1 200` com `{"messages":[...]}` contendo a mensagem criada na Task 5.

- [ ] **Step 4: Rodar testes e typecheck**

Run: `cd server && npm test && npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/contactRoutes.ts server/src/app.ts
git commit -m "feat(server): expose contact inbox routes to superadmin"
```

---

### Task 7: Confirmação de reserva por e-mail

**Files:**
- Create: `server/src/lib/emails/bookingConfirmation.ts`
- Create: `server/src/lib/emails/bookingConfirmation.test.ts`
- Modify: `server/src/services/bookingService.ts`

**Interfaces:**
- Consumes: `renderEmail`/`escapeHtml` (Task 1), `sendMail` (Task 1), `toMinutes`/`toTime` de `lib/time.ts`, `businessRepository.findById`.
- Produces:
  - `formatBookingDate(date: Date): string` — data em pt-BR, determinística (ex.: `"segunda-feira, 03/08/2026"`).
  - `bookingTimeRange(startTime: string, durationMinutes: number): string` — ex.: `"14:00 às 14:45"`.
  - `sendBookingConfirmationEmail(input: BookingConfirmationInput): Promise<void>`.

- [ ] **Step 1: Escrever os testes dos formatadores**

Criar `server/src/lib/emails/bookingConfirmation.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { bookingTimeRange, formatBookingDate } from "./bookingConfirmation";

// As datas de slot são gravadas em UTC à meia-noite. Formatar com fuso local
// deslocaria o dia para trás no Brasil — por isso a leitura é feita em UTC.
test("formatBookingDate mostra dia da semana e data em pt-BR", () => {
  assert.equal(
    formatBookingDate(new Date("2026-08-03T00:00:00.000Z")),
    "segunda-feira, 03/08/2026",
  );
});

test("bookingTimeRange soma a duração ao início", () => {
  assert.equal(bookingTimeRange("14:00", 45), "14:00 às 14:45");
  assert.equal(bookingTimeRange("23:30", 45), "23:30 às 00:15");
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd server && npx tsx --test src/lib/emails/bookingConfirmation.test.ts`
Expected: FAIL — `Cannot find module './bookingConfirmation'`

- [ ] **Step 3: Implementar o template**

Criar `server/src/lib/emails/bookingConfirmation.ts`:

```ts
import { toMinutes, toTime } from "../time";
import { escapeHtml, renderEmail } from "../emailLayout";
import { sendMail } from "../mailer";

const WEEKDAYS = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
];

// Leitura em UTC porque o slot é gravado à meia-noite UTC: usar o fuso do
// servidor faria a reserva aparecer no dia anterior.
export function formatBookingDate(date: Date): string {
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${WEEKDAYS[date.getUTCDay()]}, ${day}/${month}/${date.getUTCFullYear()}`;
}

export function bookingTimeRange(startTime: string, durationMinutes: number): string {
  const end = toTime((toMinutes(startTime) + durationMinutes) % (24 * 60));
  return `${startTime} às ${end}`;
}

interface BookingConfirmationInput {
  to: string;
  clientName: string;
  businessName: string;
  businessAddress: string | null;
  serviceName: string;
  employeeName: string;
  date: Date;
  startTime: string;
  durationMinutes: number;
}

function row(label: string, value: string): string {
  return `<p style="margin: 0 0 8px;"><strong>${label}:</strong> ${escapeHtml(value)}</p>`;
}

export function sendBookingConfirmationEmail(
  input: BookingConfirmationInput,
): Promise<void> {
  return sendMail({
    to: input.to,
    subject: `Reserva confirmada — ${input.businessName}`,
    html: renderEmail({
      heading: `Olá, ${escapeHtml(input.clientName)}!`,
      bodyHtml: `
        <p style="margin: 0 0 16px;">Sua reserva está confirmada.</p>
        ${row("Negócio", input.businessName)}
        ${row("Serviço", input.serviceName)}
        ${row("Profissional", input.employeeName)}
        ${row("Data", formatBookingDate(input.date))}
        ${row("Horário", bookingTimeRange(input.startTime, input.durationMinutes))}
        ${input.businessAddress ? row("Endereço", input.businessAddress) : ""}
      `,
      footnote: "Precisa remarcar? Fale direto com o estabelecimento.",
    }),
  });
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd server && npx tsx --test src/lib/emails/bookingConfirmation.test.ts`
Expected: PASS (2 testes)

- [ ] **Step 5: Disparar o e-mail no núcleo de criação de reserva**

Em `server/src/services/bookingService.ts`, adicionar aos imports:

```ts
import { sendBookingConfirmationEmail } from "../lib/emails/bookingConfirmation";
import { businessRepository } from "../repositories/businessRepository";
```

E, dentro de `createBookingForBusiness`, entre a checagem `if (!booking) { ... }` e o `return`, inserir:

```ts
  // Aqui e não no chamador: os dois fluxos (público e interno) passam por este
  // ponto, então a confirmação sai uma vez só, sem duplicar código.
  if (booking.clientEmail) {
    try {
      const business = await businessRepository.findById(businessId);
      await sendBookingConfirmationEmail({
        to: booking.clientEmail,
        clientName,
        businessName: business?.name ?? "Time Flow",
        businessAddress: business?.address ?? null,
        serviceName: service.name,
        employeeName: slot.employee.name,
        date: slot.date,
        startTime: slot.startTime,
        durationMinutes: service.duration,
      });
    } catch (error) {
      // A reserva já está no banco e o horário já foi travado: falha de e-mail
      // não pode transformar uma reserva válida em erro para o cliente.
      console.error(`Falha ao enviar confirmação para ${booking.clientEmail}:`, error);
    }
  }
```

- [ ] **Step 6: Verificar no fluxo real**

Com a API e o front rodando, faça uma reserva pela página pública (`/<slug>`) informando um e-mail no passo de dados. No terminal do servidor deve aparecer `[mailer] modo console — para: <e-mail informado> | assunto: Reserva confirmada — <negócio>`.

Repita sem informar e-mail: nenhuma linha `[mailer]` deve aparecer, e a reserva deve concluir normalmente.

- [ ] **Step 7: Rodar testes e typecheck**

Run: `cd server && npm test && npm run typecheck`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add server/src/lib/emails/bookingConfirmation.ts server/src/lib/emails/bookingConfirmation.test.ts server/src/services/bookingService.ts
git commit -m "feat(server): email booking confirmation to clients"
```

---

### Task 8: Página `/contato` na landing

**Files:**
- Create: `web/lib/contact.ts`
- Create: `web/lib/contact.test.ts`
- Create: `web/app/contato/page.tsx`
- Create: `web/app/contato/contact-form.tsx`
- Modify: `web/app/landing-header.tsx` (item de nav)
- Modify: `web/app/page.tsx` (CTA no fim da seção de preços)

**Interfaces:**
- Consumes: `fetchAdapter`/`ApiError` de `@/adapters/fetchAdapter`; componentes `Button`, `Input`, `Textarea`, `Label`, `Select` de `@/components/ui/*`; `LandingHeader` de `@/app/landing-header`; rota `POST /public/contact` (Task 5).
- Produces:
  - `interface ContactFormValues { name: string; email: string; phone: string; businessName: string; teamSize: string; message: string }`
  - `validateContactForm(values: ContactFormValues): Partial<Record<keyof ContactFormValues, string>>`
  - `TEAM_SIZE_OPTIONS: { value: string; label: string }[]`
  - Página em `/contato`.

- [ ] **Step 1: Escrever os testes da validação**

Criar `web/lib/contact.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ContactFormValues,
  TEAM_SIZE_OPTIONS,
  validateContactForm,
} from "./contact";

function values(overrides: Partial<ContactFormValues> = {}): ContactFormValues {
  return {
    name: "Zé da Silva",
    email: "ze@exemplo.com",
    phone: "",
    businessName: "",
    teamSize: "",
    message: "Quero conhecer os planos para minha barbearia.",
    ...overrides,
  };
}

test("formulário completo não tem erros", () => {
  assert.deepEqual(validateContactForm(values()), {});
});

test("nome e mensagem são obrigatórios", () => {
  const errors = validateContactForm(values({ name: "  ", message: "" }));

  assert.equal(errors.name, "Informe seu nome.");
  assert.equal(errors.message, "Escreva sua mensagem.");
});

test("e-mail precisa ter formato válido", () => {
  assert.equal(
    validateContactForm(values({ email: "ze-arroba-exemplo" })).email,
    "Informe um e-mail válido.",
  );
  assert.equal(
    validateContactForm(values({ email: "" })).email,
    "Informe seu e-mail.",
  );
});

// O servidor corta em 2000; barrar antes evita um 400 sem explicação no campo.
test("mensagem acima de 2000 caracteres é rejeitada", () => {
  const errors = validateContactForm(values({ message: "a".repeat(2001) }));

  assert.equal(errors.message, "Mensagem muito longa (máximo de 2000 caracteres).");
});

// Os valores precisam bater com o enum do schema da rota pública.
test("as faixas de equipe são as aceitas pela API", () => {
  assert.deepEqual(
    TEAM_SIZE_OPTIONS.map((option) => option.value),
    ["1", "2-5", "6+"],
  );
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd web && npx tsx --test lib/contact.test.ts`
Expected: FAIL — `Cannot find module './contact'`

- [ ] **Step 3: Implementar as regras do formulário**

Criar `web/lib/contact.ts`:

```ts
export interface ContactFormValues {
  name: string;
  email: string;
  phone: string;
  businessName: string;
  teamSize: string;
  message: string;
}

export type ContactFormErrors = Partial<Record<keyof ContactFormValues, string>>;

// Os valores batem com o enum de `teamSize` no schema de POST /public/contact.
export const TEAM_SIZE_OPTIONS = [
  { value: "1", label: "Só eu" },
  { value: "2-5", label: "2 a 5 profissionais" },
  { value: "6+", label: "6 ou mais" },
];

export const MESSAGE_MAX_LENGTH = 2000;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateContactForm(values: ContactFormValues): ContactFormErrors {
  const errors: ContactFormErrors = {};

  if (!values.name.trim()) {
    errors.name = "Informe seu nome.";
  }

  const email = values.email.trim();
  if (!email) {
    errors.email = "Informe seu e-mail.";
  } else if (!EMAIL_PATTERN.test(email)) {
    errors.email = "Informe um e-mail válido.";
  }

  const message = values.message.trim();
  if (!message) {
    errors.message = "Escreva sua mensagem.";
  } else if (message.length > MESSAGE_MAX_LENGTH) {
    errors.message = "Mensagem muito longa (máximo de 2000 caracteres).";
  }

  return errors;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd web && npm test`
Expected: PASS — inclusive os testes já existentes de `lib/`.

- [ ] **Step 5: Criar o formulário**

Criar `web/app/contato/contact-form.tsx`:

```tsx
"use client";

import { FormEvent, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { ApiError, fetchAdapter } from "@/adapters/fetchAdapter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ContactFormErrors,
  ContactFormValues,
  TEAM_SIZE_OPTIONS,
  validateContactForm,
} from "@/lib/contact";

const EMPTY: ContactFormValues = {
  name: "",
  email: "",
  phone: "",
  businessName: "",
  teamSize: "",
  message: "",
};

export function ContactForm() {
  const [values, setValues] = useState<ContactFormValues>(EMPTY);
  const [errors, setErrors] = useState<ContactFormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  // Honeypot: escondido para humano, visível para bot que varre inputs.
  const [website, setWebsite] = useState("");

  function update(field: keyof ContactFormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const found = validateContactForm(values);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSending(true);
    setSubmitError(null);

    try {
      await fetchAdapter({
        method: "POST",
        path: "/public/contact",
        body: {
          name: values.name.trim(),
          email: values.email.trim(),
          message: values.message.trim(),
          // Campos opcionais só vão quando preenchidos: o schema da rota
          // recusa string vazia em `teamSize` (é enum).
          ...(values.phone.trim() ? { phone: values.phone.trim() } : {}),
          ...(values.businessName.trim()
            ? { businessName: values.businessName.trim() }
            : {}),
          ...(values.teamSize ? { teamSize: values.teamSize } : {}),
          ...(website ? { website } : {}),
        },
      });
      setSent(true);
    } catch (error) {
      if (error instanceof ApiError && error.status === 429) {
        setSubmitError(
          "Você enviou várias mensagens seguidas. Tente novamente em uma hora.",
        );
      } else {
        setSubmitError(
          "Não consegui enviar sua mensagem. Tente de novo em instantes.",
        );
      }
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div className="flex flex-col items-center rounded-2xl border border-indigo-100 bg-white p-10 text-center shadow-sm">
        <HugeiconsIcon
          icon={CheckmarkCircle02Icon}
          className="size-10 text-indigo-600"
        />
        <h2 className="mt-4 text-xl font-semibold text-zinc-900">
          Mensagem enviada
        </h2>
        <p className="mt-2 max-w-sm text-sm text-zinc-600">
          Respondo em até 1 dia útil, no e-mail que você informou. Enquanto isso,
          você já pode conferir os planos.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8"
      noValidate
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor="name">Seu nome</Label>
          <Input
            id="name"
            value={values.name}
            onChange={(event) => update("name", event.target.value)}
            aria-invalid={Boolean(errors.name)}
          />
          {errors.name && (
            <p className="mt-1 text-xs text-red-600">{errors.name}</p>
          )}
        </div>

        <div>
          <Label htmlFor="email">E-mail</Label>
          <Input
            id="email"
            type="email"
            value={values.email}
            onChange={(event) => update("email", event.target.value)}
            aria-invalid={Boolean(errors.email)}
          />
          {errors.email && (
            <p className="mt-1 text-xs text-red-600">{errors.email}</p>
          )}
        </div>

        <div>
          <Label htmlFor="phone">WhatsApp (opcional)</Label>
          <Input
            id="phone"
            value={values.phone}
            onChange={(event) => update("phone", event.target.value)}
          />
        </div>

        <div>
          <Label htmlFor="businessName">Nome do negócio (opcional)</Label>
          <Input
            id="businessName"
            value={values.businessName}
            onChange={(event) => update("businessName", event.target.value)}
          />
        </div>

        <div>
          <Label htmlFor="teamSize">Quantos profissionais? (opcional)</Label>
          <select
            id="teamSize"
            value={values.teamSize}
            onChange={(event) => update("teamSize", event.target.value)}
            className="mt-1 h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm"
          >
            <option value="">Prefiro não dizer</option>
            {TEAM_SIZE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2">
          <Label htmlFor="message">Como posso ajudar?</Label>
          <Textarea
            id="message"
            rows={5}
            value={values.message}
            onChange={(event) => update("message", event.target.value)}
            aria-invalid={Boolean(errors.message)}
            placeholder="Conte como sua agenda funciona hoje e o que te trouxe aqui."
          />
          {errors.message && (
            <p className="mt-1 text-xs text-red-600">{errors.message}</p>
          )}
        </div>
      </div>

      {/* Honeypot: fora da tela e fora da ordem de tabulação. */}
      <div aria-hidden className="absolute left-[-9999px]">
        <label htmlFor="website">Não preencha este campo</label>
        <input
          id="website"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(event) => setWebsite(event.target.value)}
        />
      </div>

      {submitError && (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {submitError}
        </p>
      )}

      <Button type="submit" disabled={sending} className="mt-6 w-full sm:w-auto">
        {sending ? "Enviando..." : "Enviar mensagem"}
      </Button>
      <p className="mt-3 text-xs text-zinc-500">
        Sem robô e sem fila: quem responde é quem construiu o Time Flow.
      </p>
    </form>
  );
}
```

Se `Textarea`, `Input` ou `Label` tiverem props diferentes das usadas aqui, ajuste conforme a assinatura real em `web/components/ui/`. O `select` nativo é intencional: o `Select` do shadcn no projeto é usado dentro de formulários controlados mais complexos e traria estado extra sem ganho aqui.

- [ ] **Step 6: Criar a página**

Criar `web/app/contato/page.tsx`:

```tsx
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
    <div className="flex flex-1 flex-col bg-zinc-50">
      <LandingHeader />

      <section className="bg-gradient-to-b from-indigo-700 to-indigo-500 pb-20">
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
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <h2 className="text-sm font-semibold text-zinc-900">
                O que acontece depois
              </h2>
              <ul className="mt-4 space-y-4">
                {promises.map((promise) => (
                  <li key={promise.title} className="flex gap-3">
                    <HugeiconsIcon
                      icon={promise.icon}
                      className="mt-0.5 size-5 shrink-0 text-indigo-600"
                    />
                    <div>
                      <p className="text-sm font-medium text-zinc-900">
                        {promise.title}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-zinc-600">
                        {promise.description}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <h2 className="text-sm font-semibold text-zinc-900">
                Perguntas frequentes
              </h2>
              <dl className="mt-4 space-y-4">
                {faq.map((item) => (
                  <div key={item.question}>
                    <dt className="text-sm font-medium text-zinc-900">
                      {item.question}
                    </dt>
                    <dd className="mt-1 text-xs leading-5 text-zinc-600">
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
```

- [ ] **Step 7: Ligar a página à navegação**

Em `web/app/landing-header.tsx`, adicionar ao array `navLinks`:

```ts
  { label: "Contato", href: "/contato" },
```

Como os outros itens são âncoras (`#produto`) e este é uma rota, o `<a>` do header funciona para os dois casos sem alteração.

Em `web/app/page.tsx`, ao final da seção de preços (`id="precos"`), adicionar um bloco de fechamento antes de encerrar a seção:

```tsx
        <div className="mx-auto mt-16 max-w-2xl rounded-2xl bg-indigo-950 px-6 py-10 text-center text-white">
          <h3 className="text-2xl font-semibold tracking-tight">
            Ainda em dúvida sobre qual plano?
          </h3>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-indigo-100">
            Me conte como sua agenda funciona hoje. Respondo em até 1 dia útil,
            dizendo se o Time Flow resolve o seu caso.
          </p>
          <Link
            href="/contato"
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-medium text-indigo-950 transition-colors hover:bg-indigo-50"
          >
            Falar com quem fez o produto
            <HugeiconsIcon icon={ArrowRight02Icon} className="size-4" />
          </Link>
        </div>
```

`Link`, `HugeiconsIcon` e `ArrowRight02Icon` já estão importados no arquivo.

- [ ] **Step 8: Verificar no navegador**

Com API (`cd server && npm run dev`) e front (`cd web && npm run dev`) rodando, abrir `http://localhost:3000/contato` e:

1. Enviar o formulário vazio — os erros devem aparecer por campo, sem chamada de rede.
2. Enviar com e-mail inválido — erro só no campo de e-mail.
3. Enviar preenchido — o card de sucesso substitui o formulário e o terminal do servidor mostra as duas linhas `[mailer] modo console`.
4. Enviar mais três vezes seguidas — a quarta deve mostrar a mensagem de "várias mensagens seguidas".
5. Conferir na home que o item "Contato" aparece no header e que o CTA no fim dos preços leva a `/contato`.

- [ ] **Step 9: Rodar lint, testes e typecheck**

Run: `cd web && npm test && npm run typecheck && npm run lint`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add web/lib/contact.ts web/lib/contact.test.ts web/app/contato web/app/landing-header.tsx web/app/page.tsx
git commit -m "feat(web): add contact page with qualified lead form"
```

---

### Task 9: Caixa de entrada de contatos no dashboard

**Files:**
- Create: `web/app/dashboard/contatos/page.tsx`
- Modify: `web/app/dashboard/layout.tsx` (item de nav)
- Modify: `web/lib/types.ts` (tipo `ContactMessage`)

**Interfaces:**
- Consumes: `GET /contact-messages` e `PATCH /contact-messages/:id` (Task 6); `fetchAdapter`/`ApiError`; `useAuthUser` de `@/app/dashboard/auth-context`; `Badge`, `Button` de `@/components/ui/*`.
- Produces: rota `/dashboard/contatos` visível só para SUPERADMIN e `interface ContactMessage` em `web/lib/types.ts`.

- [ ] **Step 1: Declarar o tipo**

Ao final de `web/lib/types.ts`:

```ts
export type ContactStatus = "NEW" | "READ" | "ARCHIVED";

export interface ContactMessage {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  businessName: string | null;
  teamSize: string | null;
  message: string;
  status: ContactStatus;
  createdAt: string; // ISO string vinda da API
}
```

- [ ] **Step 2: Criar a página**

Criar `web/app/dashboard/contatos/page.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { ApiError, fetchAdapter } from "@/adapters/fetchAdapter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ContactMessage, ContactStatus } from "@/lib/types";
import { useAuthUser } from "../auth-context";

const statusLabels: Record<ContactStatus, string> = {
  NEW: "Nova",
  READ: "Lida",
  ARCHIVED: "Arquivada",
};

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export default function ContatosPage() {
  const user = useAuthUser();
  const isSuperadmin = user.role === "SUPERADMIN";

  const [messages, setMessages] = useState<ContactMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const load = useCallback(() => {
    return fetchAdapter<{ messages: ContactMessage[] }>({
      method: "GET",
      path: "/contact-messages",
    })
      .then(({ data }) => {
        setMessages(data.messages);
        setError(null);
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : "Erro inesperado.");
      });
  }, []);

  useEffect(() => {
    if (!isSuperadmin) return;
    startTransition(async () => {
      await load();
    });
  }, [isSuperadmin, load]);

  function changeStatus(id: number, status: ContactStatus) {
    startTransition(async () => {
      await fetchAdapter({
        method: "PATCH",
        path: `/contact-messages/${id}`,
        body: { status },
      }).catch((err) => {
        setError(err instanceof ApiError ? err.message : "Erro inesperado.");
      });
      await load();
    });
  }

  // A guarda de verdade é no servidor (authorize SUPERADMIN); esta é só para
  // não mostrar uma tela vazia e um erro 403 a quem errou a URL.
  if (!isSuperadmin) {
    return (
      <p className="text-sm text-muted-foreground">
        Esta página é exclusiva do administrador da plataforma.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Contatos</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Mensagens enviadas pelo formulário da landing page.
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}{" "}
          <button className="underline" onClick={() => load()} type="button">
            Tentar de novo
          </button>
        </div>
      )}

      {messages === null && !error && (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      )}

      {messages?.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nenhuma mensagem ainda. Quando alguém escrever pela página de contato,
          ela aparece aqui.
        </p>
      )}

      <ul className="flex flex-col gap-4">
        {messages?.map((message) => (
          <li
            key={message.id}
            className="rounded-2xl border border-border bg-card p-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium">{message.name}</p>
                <p className="text-xs text-muted-foreground">
                  {message.email}
                  {message.phone ? ` · ${message.phone}` : ""}
                  {message.businessName ? ` · ${message.businessName}` : ""}
                  {message.teamSize ? ` · ${message.teamSize}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={message.status === "NEW" ? "default" : "secondary"}>
                  {statusLabels[message.status]}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {dateFormatter.format(new Date(message.createdAt))}
                </span>
              </div>
            </div>

            <p className="mt-4 text-sm whitespace-pre-wrap">{message.message}</p>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button asChild size="sm" variant="outline">
                <a href={`mailto:${message.email}`}>Responder por e-mail</a>
              </Button>
              {message.status !== "READ" && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={isPending}
                  onClick={() => changeStatus(message.id, "READ")}
                >
                  Marcar como lida
                </Button>
              )}
              {message.status !== "ARCHIVED" && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={isPending}
                  onClick={() => changeStatus(message.id, "ARCHIVED")}
                >
                  Arquivar
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

Se `Badge` não aceitar as variantes `default`/`secondary` como escritas, use as que existirem em `web/components/ui/badge.tsx`. Se `Button` não suportar `asChild`, troque o botão de responder por um `<a>` com as classes do botão.

- [ ] **Step 3: Adicionar o item de navegação**

Em `web/app/dashboard/layout.tsx`, importar o ícone junto dos demais de `@hugeicons/core-free-icons`:

```ts
  Mail01Icon,
```

E adicionar ao array `navItems`, antes de "Configurações":

```ts
  {
    label: "Contatos",
    href: "/dashboard/contatos",
    icon: Mail01Icon,
    roles: ["SUPERADMIN"],
  },
```

- [ ] **Step 4: Verificar no navegador**

Logado como SUPERADMIN, abrir `/dashboard/contatos`: a mensagem enviada na Task 8 deve aparecer, com data formatada. Clicar em "Marcar como lida" — o selo muda para "Lida" e o botão some. Recarregar a página e confirmar que o status persistiu.

Logado como ADMIN, confirmar que o item "Contatos" não aparece na sidebar.

- [ ] **Step 5: Rodar lint, testes e typecheck**

Run: `cd web && npm test && npm run typecheck && npm run lint`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add web/app/dashboard/contatos web/app/dashboard/layout.tsx web/lib/types.ts
git commit -m "feat(web): add superadmin contact inbox"
```

---

## Configuração de produção (fora do código)

Depois do merge, para os e-mails saírem de verdade:

1. Verificar o domínio no painel do Resend (registros DNS de SPF e DKIM).
2. Criar uma API key e definir no Railway: `RESEND_API_KEY`, `MAIL_FROM` (com um endereço do domínio verificado) e `CONTACT_INBOX`.
3. Remover as variáveis `SMTP_*` do ambiente de produção — não são mais lidas.

Enquanto `RESEND_API_KEY` não existir no ambiente, a aplicação funciona normalmente e nenhum e-mail é entregue.
