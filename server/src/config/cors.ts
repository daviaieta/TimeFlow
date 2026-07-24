import type { FastifyCorsOptions } from "@fastify/cors";
import { env } from "./env";

// O default do @fastify/cors é "GET,HEAD,POST": sem declarar os métodos aqui,
// o browser bloqueia PUT/DELETE no preflight mesmo com a rota funcionando.
export const corsOptions: FastifyCorsOptions = {
  origin: env.webOrigin,
  methods: ["GET", "HEAD", "POST", "PUT", "DELETE"],
};
