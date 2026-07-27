import "dotenv/config";
import { parseOrigins } from "./origins";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const webOrigins = parseOrigins(process.env.WEB_ORIGIN);

export const env = {
  port: Number(process.env.PORT ?? 3333),
  // Em container, o default do Fastify (127.0.0.1) faria o serviço não
  // receber tráfego externo. 0.0.0.0 escuta em todas as interfaces.
  host: process.env.HOST ?? "0.0.0.0",
  nodeEnv: process.env.NODE_ENV ?? "development",
  databaseUrl: required("DATABASE_URL"),
  jwtSecret: required("JWT_SECRET"),
  // CORS aceita todas; o link de convite (e-mail, precisa de uma URL só)
  // usa sempre a primeira — o domínio final, não uma URL de preview.
  webOrigins,
  webOrigin: webOrigins[0],
};
