import "dotenv/config";
import fastifyCors from "@fastify/cors";
import fastifyJwt from "@fastify/jwt";
import fastifyMultipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { fastify, FastifyInstance } from "fastify";
import { corsOptions } from "./config/cors";
import { env } from "./config/env";
import { errorHandler } from "./lib/errorHandler";
import { availabilityRoutes } from "./routes/availabilityRoutes";
import { authRoutes } from "./routes/authRoutes";
import { billingRoutes, stripeWebhookRoutes } from "./routes/billingRoutes";
import { bookingRoutes } from "./routes/bookingRoutes";
import { businessRoutes } from "./routes/businessRoutes";
import { contactRoutes } from "./routes/contactRoutes";
import { crmRoutes } from "./routes/crmRoutes";
import { dashboardRoutes } from "./routes/dashboardRoutes";
import { employeeRoutes } from "./routes/employeeRoutes";
import { healthRoutes } from "./routes/healthRoutes";
import { publicRoutes } from "./routes/publicRoutes";
import { serviceRoutes } from "./routes/serviceRoutes";
import { loyaltyRoutes } from "./routes/loyaltyRoutes";
import { notesRoutes } from "./routes/notesRoutes";
import { tagsRoutes } from "./routes/tagsRoutes";
import { MAX_IMAGE_BYTES } from "./services/imageRules";
import "./interfaces/auth";

// Monta a aplicação sem subir o processo. Separar as duas coisas é o que
// permite testar rotas com app.inject() sem abrir porta.
export function buildApp(): FastifyInstance {
  const app = fastify({
    // Em produção a API roda atrás do proxy do Railway: sem isso,
    // request.ip é sempre o IP do proxy e o rate limit por IP (ex.: contato)
    // vira um limite global compartilhado por todo mundo. O valor é 1 (e não
    // true) para confiar em só um salto — o do próprio proxy do Railway — e
    // usar o IP que ELE anexou; com `true` o Fastify confia na cadeia inteira
    // e usa o X-Forwarded-For mais à esquerda, que é escrito pelo cliente,
    // tornando o rate limit por IP contornável só forjando esse header.
    trustProxy: 1,
    ajv: {
      customOptions: {
        removeAdditional: true,
        coerceTypes: true,
        allErrors: true,
      },
    },
  });

  app.register(fastifyCors, corsOptions);
  app.register(fastifyJwt, { secret: env.jwtSecret });

  app.register(fastifyMultipart, {
    // O plugin corta o stream no limite: um arquivo gigante nunca chega a
    // virar Buffer na memória do processo. `fields: 0` e `parts: 2` fecham a
    // brecha que sobrava: sem eles, os defaults do busboy (fieldSize de 1 MB,
    // parts na casa dos milhares) deixam uma requisição autenticada empurrar
    // muitos megabytes em campos de texto antes de qualquer arquivo — o
    // bodyLimit do Fastify não vale para multipart. O front nunca manda
    // campo nenhum, só o arquivo.
    limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 0, parts: 2 },
  });

  // Só no modo disco. Em produção quem serve as imagens é o R2, e expor uma
  // pasta que nem existe seria só superfície a mais.
  if (env.storage.mode === "disk") {
    app.register(fastifyStatic, {
      root: env.storage.rootDir,
      prefix: "/uploads/",
      // Sem wildcard: false — com ele, o plugin listaria a pasta uma única
      // vez no registro e só serviria os arquivos que já existiam naquele
      // instante; todo upload real acontece depois do boot e viraria 404
      // para sempre. O plugin já tolera a pasta ainda não existir no
      // primeiro boot (registra um log.warn e segue).
    });
  }

  app.setErrorHandler(errorHandler);

  app.get("/", async () => {
    return { message: "Welcome to TIME FLOW" };
  });

  app.register(healthRoutes);
  app.register(authRoutes);
  app.register(businessRoutes);
  app.register(contactRoutes);
  // Com a cobrança desligada não há checkout para abrir nem evento para
  // receber: as rotas somem em vez de responderem um erro confuso.
  if (env.billingEnabled) {
    app.register(billingRoutes);
    app.register(stripeWebhookRoutes);
  }
  app.register(dashboardRoutes);
  app.register(serviceRoutes);
  app.register(employeeRoutes);
  app.register(availabilityRoutes);
  app.register(bookingRoutes);
  app.register(publicRoutes);

  // Com o CRM desligado não há prontuário para listar nem configurar: as rotas
  // somem em vez de responderem um erro confuso. Mesmo padrão da cobrança — e
  // a assimetria de polaridade é a mesma (ver config/env): esquecer a variável
  // tem que ser inofensivo no sentido de NÃO expor o CRM. Ligar é ato explícito.
  if (env.crmEnabled) {
    app.register(crmRoutes);
    app.register(loyaltyRoutes);
    app.register(notesRoutes);
    app.register(tagsRoutes);
  }

  return app;
}