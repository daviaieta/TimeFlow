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

// Em produção, se cair no modo console (falta de RESEND_API_KEY), links —
// inclusive token de convite — não podem vazar para o log: quem tiver acesso
// ao log ganharia um link que define a senha da conta.
test("sem apiKey em produção, o cabeçalho aparece mas os links não", async () => {
  const logger = fakeLogger();
  const send = createMailer({
    apiKey: null,
    from: "Time Flow <x@y.com>",
    logger,
    isProduction: true,
  });

  await send({
    to: "ze@exemplo.com",
    subject: "Convite",
    html: '<a href="https://timeflow.app/accept-invite?token=abc">Definir senha</a>',
  });

  const output = logger.lines.join("\n");
  assert.ok(output.includes("ze@exemplo.com"));
  assert.ok(output.includes("Convite"));
  assert.ok(!output.includes("https://timeflow.app/accept-invite?token=abc"));
  assert.equal(logger.lines.length, 1);
});
