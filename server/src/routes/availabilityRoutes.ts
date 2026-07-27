import { Role } from "@prisma/client";
import { FastifyInstance } from "fastify";
import {
  deleteAvailability,
  generateAvailabilities,
  listAvailabilities,
  updateAvailability,
  AvailabilityBody,
  AvailabilityParams,
  GenerateAvailabilitiesBody,
  ListAvailabilitiesQuery,
} from "../controllers/availabilityController";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";
import { requireActiveSubscription } from "../middlewares/requireActiveSubscription";

const availabilityBodySchema = {
  body: {
    type: "object",
    required: ["date", "startTime", "endTime"],
    additionalProperties: false,
    properties: {
      date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      startTime: { type: "string", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" },
      endTime: { type: "string", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" },
    },
  },
};

const timePattern = "^([01]\\d|2[0-3]):[0-5]\\d$";

const generateSchema = {
  body: {
    type: "object",
    required: ["startDate", "endDate", "weekdays", "workStart", "workEnd", "slotMinutes"],
    additionalProperties: false,
    properties: {
      startDate: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      endDate: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      weekdays: {
        type: "array",
        items: { type: "integer", minimum: 0, maximum: 6 },
        minItems: 1,
        maxItems: 7,
        uniqueItems: true,
      },
      workStart: { type: "string", pattern: timePattern },
      workEnd: { type: "string", pattern: timePattern },
      breakStart: { type: "string", pattern: timePattern },
      breakEnd: { type: "string", pattern: timePattern },
      slotMinutes: { type: "integer", enum: [15, 30, 45, 60, 90] },
    },
  },
};

const listAvailabilitiesSchema = {
  querystring: {
    type: "object",
    additionalProperties: false,
    properties: {
      tab: { type: "string", enum: ["upcoming", "past"] },
      page: { type: "integer", minimum: 1 },
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
  app.get<{ Querystring: ListAvailabilitiesQuery }>(
    "/availabilities",
    {
      schema: listAvailabilitiesSchema,
      preHandler: [authenticate, requireActiveSubscription, authorize(Role.EMPLOYEE)],
    },
    listAvailabilities,
  );

  app.post<{ Body: GenerateAvailabilitiesBody }>(
    "/availabilities/generate",
    {
      schema: generateSchema,
      preHandler: [authenticate, requireActiveSubscription, authorize(Role.EMPLOYEE)],
    },
    generateAvailabilities,
  );

  app.put<{ Body: AvailabilityBody; Params: AvailabilityParams }>(
    "/availabilities/:id",
    {
      schema: { ...availabilityBodySchema, ...availabilityParamsSchema },
      preHandler: [authenticate, requireActiveSubscription, authorize(Role.EMPLOYEE)],
    },
    updateAvailability,
  );

  app.delete<{ Params: AvailabilityParams }>(
    "/availabilities/:id",
    {
      schema: availabilityParamsSchema,
      preHandler: [authenticate, requireActiveSubscription, authorize(Role.EMPLOYEE)],
    },
    deleteAvailability,
  );
}
