import { buildApp } from "./app";
import { env } from "./config/env";

async function start(): Promise<void> {
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
