import { buildApp } from "./app";
import { env } from "./config/env";

async function start(): Promise<void> {
  // Variáveis de produção são um passo manual pós-merge: o primeiro deploy
  // sem RESEND_API_KEY não deve falhar em silêncio — convites e confirmações
  // de agendamento não seriam entregues e ninguém seria avisado.
  if (env.nodeEnv === "production" && !env.resendApiKey) {
    console.error(
      "[mailer] ATENÇÃO: RESEND_API_KEY não configurada em produção — nenhum e-mail será entregue até que a variável seja definida.",
    );
  }

  const app = buildApp();

  try {
    await app.listen({ port: env.port, host: env.host });
    console.log(`Server listening on ${env.host}:${env.port}`);
  } catch (error) {
    // Sem isto, uma falha de bind vira unhandled rejection e o processo
    // continua de pé sem atender ninguém — o provedor marcaria como saudável.
    app.log.error(error);
    process.exit(1);
  }
}

start();
