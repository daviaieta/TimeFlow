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
