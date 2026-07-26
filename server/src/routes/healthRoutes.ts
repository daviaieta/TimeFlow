import { FastifyInstance } from "fastify";
import { healthRepository } from "../repositories/healthRepository";
import { buildHealthReport } from "../services/healthRules";

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async (_request, reply) => {
    const report = buildHealthReport(await healthRepository.isReachable());

    return reply.status(report.status === "ok" ? 200 : 503).send(report);
  });
}
