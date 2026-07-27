import { Role } from "@prisma/client";
import { FastifyInstance } from "fastify";
import {
  createService,
  deleteService,
  listServices,
  updateService,
  ServiceBody,
  ServiceParams,
} from "../controllers/serviceController";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";
import { requireActiveSubscription } from "../middlewares/requireActiveSubscription";

const serviceBodySchema = {
  body: {
    type: "object",
    required: ["name", "duration", "price"],
    additionalProperties: false,
    properties: {
      name: { type: "string", minLength: 1 },
      duration: { type: "integer", minimum: 1 },
      price: { type: "number", minimum: 0 },
    },
  },
};

const serviceParamsSchema = {
  params: {
    type: "object",
    required: ["id"],
    properties: {
      id: { type: "integer" },
    },
  },
};

export async function serviceRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: ServiceBody }>(
    "/services",
    {
      schema: serviceBodySchema,
      preHandler: [authenticate, requireActiveSubscription, authorize(Role.ADMIN)],
    },
    createService,
  );

  app.get(
    "/services",
    { preHandler: [authenticate, requireActiveSubscription, authorize(Role.ADMIN, Role.EMPLOYEE)] },
    listServices,
  );

  app.put<{ Body: ServiceBody; Params: ServiceParams }>(
    "/services/:id",
    {
      schema: { ...serviceBodySchema, ...serviceParamsSchema },
      preHandler: [authenticate, requireActiveSubscription, authorize(Role.ADMIN)],
    },
    updateService,
  );

  app.delete<{ Params: ServiceParams }>(
    "/services/:id",
    {
      schema: serviceParamsSchema,
      preHandler: [authenticate, requireActiveSubscription, authorize(Role.ADMIN)],
    },
    deleteService,
  );
}
