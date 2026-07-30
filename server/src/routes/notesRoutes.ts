import { Role } from "@prisma/client";
import { FastifyInstance } from "fastify";
import {
  createNote,
  deleteNote,
  getNotes,
  updateNote,
} from "../controllers/notesController";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";
import { requireActiveSubscription } from "../middlewares/requireActiveSubscription";

// Notes routes for CRM (fase 4). Only ADMIN/EMPLOYEE can list and create notes.
// For update and delete, the user must be the author or an ADMIN (checked in controller).
const staffOrEmployee = authorize(Role.ADMIN, Role.EMPLOYEE);

export async function notesRoutes(app: FastifyInstance): Promise<void> {
  // List notes for a customer
  app.get<{ Params: { publicId: string } }>(
    "/customers/:publicId/notes",
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
      },
      preHandler: [authenticate, requireActiveSubscription, staffOrEmployee],
    },
    getNotes,
  );

  // Create a note for a customer
  app.post<{
    Params: { publicId: string };
    Body: { body: string };
  }>(
    "/customers/:publicId/notes",
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
          required: ["body"],
          additionalProperties: false,
          properties: {
            body: { type: "string", maxLength: 5000 },
          },
        },
      },
      preHandler: [authenticate, requireActiveSubscription, staffOrEmployee],
    },
    createNote,
  );

  // Update a note
  app.patch<{
    Params: { publicId: string; id: string };
    Body: { body: string };
  }>(
    "/customers/:publicId/notes/:id",
    {
      schema: {
        params: {
          type: "object",
          required: ["publicId", "id"],
          additionalProperties: false,
          properties: {
            publicId: { type: "string", format: "uuid" },
            id: { type: "string" }, // note ID as string, but we'll parse to int in controller
          },
        },
        body: {
          type: "object",
          required: ["body"],
          additionalProperties: false,
          properties: {
            body: { type: "string", maxLength: 5000 },
          },
        },
      },
      preHandler: [authenticate, requireActiveSubscription], // authorization handled in controller
    },
    updateNote,
  );

  // Delete a note
  app.delete<{ Params: { publicId: string; id: string } }>(
    "/customers/:publicId/notes/:id",
    {
      schema: {
        params: {
          type: "object",
          required: ["publicId", "id"],
          additionalProperties: false,
          properties: {
            publicId: { type: "string", format: "uuid" },
            id: { type: "string" },
          },
        },
      },
      preHandler: [authenticate, requireActiveSubscription], // authorization handled in controller
    },
    deleteNote,
  );
}