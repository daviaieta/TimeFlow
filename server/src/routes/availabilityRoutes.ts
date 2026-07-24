import { Role } from "@prisma/client";
import { FastifyInstance } from "fastify";
import {
  createAvailability,
  deleteAvailability,
  listAvailabilities,
  updateAvailability,
  AvailabilityBody,
  AvailabilityParams,
} from "../controllers/availabilityController";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";

const availabilityBodySchema = {
  body: {
    type: "object",
    required: ["date", "startTime", "endTime"],
    additionalProperties: false,
    properties: {
      date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      startTime: { type: "string", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" },
      endTime: { type: "string", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" },
      // null é aceito de propósito: é como o PUT limpa um encaixe manual
      clientName: { type: ["string", "null"], maxLength: 80 },
    },
  },
};

const availabilityParamsSchema = {
  params: {
    type: "object",
    required: ["id"],
    properties: {
      id: { type: "integer" },
    },
  },
};

export async function availabilityRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: AvailabilityBody }>(
    "/availabilities",
    {
      schema: availabilityBodySchema,
      preHandler: [authenticate, authorize(Role.EMPLOYEE)],
    },
    createAvailability,
  );

  app.get(
    "/availabilities",
    { preHandler: [authenticate, authorize(Role.EMPLOYEE)] },
    listAvailabilities,
  );

  app.put<{ Body: AvailabilityBody; Params: AvailabilityParams }>(
    "/availabilities/:id",
    {
      schema: { ...availabilityBodySchema, ...availabilityParamsSchema },
      preHandler: [authenticate, authorize(Role.EMPLOYEE)],
    },
    updateAvailability,
  );

  app.delete<{ Params: AvailabilityParams }>(
    "/availabilities/:id",
    {
      schema: availabilityParamsSchema,
      preHandler: [authenticate, authorize(Role.EMPLOYEE)],
    },
    deleteAvailability,
  );
}
