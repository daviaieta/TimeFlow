import "dotenv/config";
import path from "node:path";
import { assertStorageReadyForProduction, resolveStorageConfig } from "../lib/storage/storageConfig";
import { parseOrigins } from "./origins";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const webOrigins = parseOrigins(process.env.WEB_ORIGIN);
const nodeEnv = process.env.NODE_ENV ?? "development";

// Cobrança desligada durante o mês de cortesia do primeiro cliente: nenhum
// negócio é bloqueado por assinatura e as rotas de checkout não sobem. O
// default é ligado — desligar tem que ser um ato explícito no provedor, senão
// um deploy com variável faltando entregaria o produto de graça em silêncio.
const billingEnabled = process.env.BILLING_ENABLED !== "false";

// Resolvido antes do objeto `env` de propósito: a checagem de produção abaixo
// precisa do storage já resolvido e do nodeEnv, e derruba o boot se a
// combinação for perigosa — ver assertStorageReadyForProduction.
const storage = resolveStorageConfig(process.env, {
  // "" conta como "não configurado" (?? só cobre undefined): descomentar a
  // variável no .env.example sem preencher não pode gravar na raiz do
  // processo nem gerar uma baseUrl vazia.
  rootDir: process.env.UPLOADS_DIR || path.resolve(process.cwd(), "uploads"),
  baseUrl: (
    process.env.PUBLIC_API_URL || `http://localhost:${process.env.PORT ?? 3333}`
  ).replace(/\/+$/, ""),
});
assertStorageReadyForProduction(nodeEnv, storage);

export const env = {
  billingEnabled,
  port: Number(process.env.PORT ?? 3333),
  // Em container, o default do Fastify (127.0.0.1) faria o serviço não
  // receber tráfego externo. 0.0.0.0 escuta em todas as interfaces.
  host: process.env.HOST ?? "0.0.0.0",
  nodeEnv,
  databaseUrl: required("DATABASE_URL"),
  jwtSecret: required("JWT_SECRET"),
  // CORS aceita todas; o link de convite (e-mail, precisa de uma URL só)
  // usa sempre a primeira — o domínio final, não uma URL de preview.
  webOrigins,
  webOrigin: webOrigins[0],
  // Só é obrigatória com a cobrança ligada: com ela desligada, exigir a chave
  // impediria o servidor de subir por causa de um serviço que nem é chamado.
  stripeSecretKey: billingEnabled
    ? required("STRIPE_SECRET_KEY")
    : (process.env.STRIPE_SECRET_KEY ?? ""),
  // Não é required: em desenvolvimento não há webhook configurado, e o fluxo
  // principal de ativação (confirmação no retorno do checkout) não depende
  // dele. Vazio faz constructEvent rejeitar toda chamada — falha fechado, que
  // é o comportamento certo.
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  // Sem chave, o mailer entra em modo console: nada é enviado de verdade.
  resendApiKey: process.env.RESEND_API_KEY ?? null,
  mailFrom: process.env.MAIL_FROM ?? '"Time Flow" <no-reply@timeflow.com>',
  // Destino das notificações de contato. Sem valor, o serviço cai no e-mail
  // do SUPERADMIN cadastrado no banco.
  contactInbox: process.env.CONTACT_INBOX ?? null,
  // Resolvido no boot de propósito: configuração do R2 pela metade (ou, em
  // produção, ausente) derruba o servidor agora, em vez de silenciosamente
  // gravar no disco efêmero e só dar sinal quando as fotos sumirem.
  storage,
};
