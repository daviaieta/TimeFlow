import { Role } from "@prisma/client";
import { FastifyInstance } from "fastify";
import { getOverview, OverviewQuery } from "../controllers/dashboardController";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";
import { requireActiveSubscription } from "../middlewares/requireActiveSubscription";

const overviewSchema = {
  querystring: {
    type: "object",
    additionalProperties: false,
    properties: {
      // coerceTypes global do Fastify converte "30" em 30 antes do enum.
      days: { type: "integer", enum: [7, 30, 90], default: 7 },
    },
  },
};

export async function dashboardRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: OverviewQuery }>(
    "/dashboard/overview",
    {
      schema: overviewSchema,
      preHandler: [authenticate, requireActiveSubscription, authorize(Role.ADMIN)],
    },
    getOverview,
  );
}
