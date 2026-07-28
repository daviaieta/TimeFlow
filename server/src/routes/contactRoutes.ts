import { Role } from "@prisma/client";
import { FastifyInstance } from "fastify";
import {
  ContactStatusBody,
  ContactStatusParams,
  listContactMessages,
  updateContactMessageStatus,
} from "../controllers/contactController";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";

// Caixa de entrada da plataforma: só o dono do produto lê. Sem
// requireActiveSubscription — o SUPERADMIN não tem negócio nem assinatura.
const statusSchema = {
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
    required: ["status"],
    additionalProperties: false,
    properties: {
      status: { type: "string", enum: ["NEW", "READ", "ARCHIVED"] },
    },
  },
};

export async function contactRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/contact-messages",
    { preHandler: [authenticate, authorize(Role.SUPERADMIN)] },
    listContactMessages,
  );

  app.patch<{ Params: ContactStatusParams; Body: ContactStatusBody }>(
    "/contact-messages/:id",
    {
      schema: statusSchema,
      preHandler: [authenticate, authorize(Role.SUPERADMIN)],
    },
    updateContactMessageStatus,
  );
}
