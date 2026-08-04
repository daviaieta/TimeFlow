import { Role } from "@prisma/client";
import { FastifyInstance } from "fastify";
import {
  attachTag,
  detachTag,
  deleteTag,
  listTags,
  createTag,
  CustomerTagParams,
  TagParams,
} from "../controllers/tagsController";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";
import { requireActiveSubscription } from "../middlewares/requireActiveSubscription";

// Tags routes for CRM (fase 4).
// - GET /tags: list tags (ADMIN/EMPLOYEE)
// - POST /tags: create tag (ADMIN)
// - DELETE /tags/:id: delete tag (ADMIN)
// - POST /customers/:publicId/tags/:tagId: attach tag to customer (ADMIN/EMPLOYEE)
// - DELETE /customers/:publicId/tags/:tagId: detach tag from customer (ADMIN/EMPLOYEE)

const staffOrEmployee = authorize(Role.ADMIN, Role.EMPLOYEE);
const adminOnly = authorize(Role.ADMIN);

export async function tagsRoutes(app: FastifyInstance): Promise<void> {
  // List tags
  app.get<{ Querystring: never }>(
    "/tags",
    {
      schema: {
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {},
        },
      },
      preHandler: [authenticate, requireActiveSubscription, staffOrEmployee],
    },
    listTags,
  );

  // Create tag
  app.post<{ Body: { name: string; color: string | null } }>(
    "/tags",
    {
      schema: {
        body: {
          type: "object",
          required: ["name"],
          additionalProperties: false,
          properties: {
            name: { type: "string", minLength: 1 },
            color: { type: "string", nullable: true },
          },
        },
      },
      preHandler: [authenticate, requireActiveSubscription, adminOnly],
    },
    createTag,
  );

  // Delete tag
  app.delete<{ Params: TagParams }>(
    "/tags/:tagId",
    {
      schema: {
        params: {
          type: "object",
          required: ["tagId"],
          additionalProperties: false,
          properties: {
            tagId: { type: "string", pattern: "^[0-9]+$" },
          },
        },
      },
      preHandler: [authenticate, requireActiveSubscription, adminOnly],
    },
    deleteTag,
  );

  // Attach tag to customer
  app.post<{ Params: CustomerTagParams }>(
    "/customers/:publicId/tags/:tagId",
    {
      schema: {
        params: {
          type: "object",
          required: ["publicId", "tagId"],
          additionalProperties: false,
          properties: {
            publicId: { type: "string", format: "uuid" },
            tagId: { type: "string", pattern: "^[0-9]+$" },
          },
        },
      },
      preHandler: [authenticate, requireActiveSubscription, staffOrEmployee],
    },
    attachTag,
  );

  // Detach tag from customer
  app.delete<{ Params: CustomerTagParams }>(
    "/customers/:publicId/tags/:tagId",
    {
      schema: {
        params: {
          type: "object",
          required: ["publicId", "tagId"],
          additionalProperties: false,
          properties: {
            publicId: { type: "string", format: "uuid" },
            tagId: { type: "string", pattern: "^[0-9]+$" },
          },
        },
      },
      preHandler: [authenticate, requireActiveSubscription, staffOrEmployee],
    },
    detachTag,
  );
}