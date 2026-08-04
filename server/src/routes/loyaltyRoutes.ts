import { Role } from "@prisma/client";
import { FastifyInstance } from "fastify";
import {
  createLoyaltyAdjust,
  getLoyaltyEntries,
  CreateLoyaltyEntryBody,
  LoyaltyCustomerParams,
  LoyaltyQuery,
} from "../controllers/loyaltyController";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";
import { requireActiveSubscription } from "../middlewares/requireActiveSubscription";

// Rotas de fidelidade (fase 4). GET: ADMIN/EMPLOYEE. POST (ADJUST): só ADMIN.
const staffOrEmployee = authorize(Role.ADMIN, Role.EMPLOYEE);
const adminOnly = authorize(Role.ADMIN);

export async function loyaltyRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: LoyaltyCustomerParams; Querystring: LoyaltyQuery }>(
    "/customers/:publicId/loyalty",
    {
      schema: {
        params: {
          type: "object",
          required: ["publicId"],
          additionalProperties: false,
          properties: {
            publicId: { type: "string", format: "uuid" },
          },
        },
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {
            cursor: { type: "string", maxLength: 512 },
            limit: { type: "integer", minimum: 1, maximum: 100 },
          },
        },
      },
      preHandler: [authenticate, requireActiveSubscription, staffOrEmployee],
    },
    getLoyaltyEntries,
  );

  app.post<{ Params: LoyaltyCustomerParams; Body: CreateLoyaltyEntryBody }>(
    "/customers/:publicId/loyalty",
    {
      schema: {
        params: {
          type: "object",
          required: ["publicId"],
          additionalProperties: false,
          properties: {
            publicId: { type: "string", format: "uuid" },
          },
        },
        body: {
          type: "object",
          required: ["points", "reason"],
          additionalProperties: false,
          properties: {
            points: { type: "integer" },
            reason: { type: "string", minLength: 3, maxLength: 200 },
            idempotencyKey: { type: "string", maxLength: 200 },
          },
        },
      },
      preHandler: [authenticate, requireActiveSubscription, adminOnly],
    },
    createLoyaltyAdjust,
  );
}