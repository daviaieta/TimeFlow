import { Role } from "@prisma/client";
import { FastifyInstance } from "fastify";
import {
  createBusiness,
  listBusinesses,
  resendInvite,
  CreateBusinessBody,
  ResendInviteBody,
  ResendInviteParams,
} from "../controllers/businessController";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";

const createBusinessSchema = {
  body: {
    type: "object",
    required: ["name", "slug", "admin"],
    additionalProperties: false,
    properties: {
      name: { type: "string", minLength: 1 },
      slug: { type: "string", minLength: 1, pattern: "^[a-z0-9]+(-[a-z0-9]+)*$" },
      admin: {
        type: "object",
        required: ["name", "email"],
        additionalProperties: false,
        properties: {
          name: { type: "string", minLength: 1 },
          email: { type: "string", format: "email" },
        },
      },
    },
  },
};

const resendInviteSchema = {
  params: {
    type: "object",
    required: ["id"],
    additionalProperties: false,
    properties: {
      id: { type: "integer" },
    },
  },
  body: {
    type: "object",
    required: ["userId"],
    additionalProperties: false,
    properties: {
      userId: { type: "integer" },
    },
  },
};

export async function businessRoutes(app: FastifyInstance): Promise<void> {
  // Sem schema: a rota não recebe params, body nem querystring.
  app.get(
    "/businesses",
    { preHandler: [authenticate, authorize(Role.SUPERADMIN)] },
    listBusinesses,
  );

  app.post<{ Body: CreateBusinessBody }>(
    "/businesses",
    {
      schema: createBusinessSchema,
      preHandler: [authenticate, authorize(Role.SUPERADMIN)],
    },
    createBusiness,
  );

  app.post<{ Params: ResendInviteParams; Body: ResendInviteBody }>(
    "/businesses/:id/resend-invite",
    {
      schema: resendInviteSchema,
      preHandler: [authenticate, authorize(Role.SUPERADMIN)],
    },
    resendInvite,
  );
}
