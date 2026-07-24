import { FastifyInstance } from "fastify";
import {
  createPublicBooking,
  getPublicBusiness,
  listPublicSlots,
  PublicBookingBody,
  PublicBusinessParams,
  PublicSlotsParams,
} from "../controllers/publicController";

// Rotas SEM authenticate — superfície pública do produto. Arquivo separado
// de propósito, para o limite público ficar visível.

const slugParamsSchema = {
  params: {
    type: "object",
    required: ["slug"],
    additionalProperties: false,
    properties: {
      slug: { type: "string", minLength: 1 },
    },
  },
};

const slotsParamsSchema = {
  params: {
    type: "object",
    required: ["slug", "employeeId"],
    additionalProperties: false,
    properties: {
      slug: { type: "string", minLength: 1 },
      employeeId: { type: "integer" },
    },
  },
};

const bookingSchema = {
  ...slugParamsSchema,
  body: {
    type: "object",
    required: ["availabilityId", "serviceId", "clientName", "clientPhone"],
    additionalProperties: false,
    properties: {
      availabilityId: { type: "integer" },
      serviceId: { type: "integer" },
      clientName: { type: "string", minLength: 1, maxLength: 80 },
      clientPhone: { type: "string", minLength: 8, maxLength: 20 },
      clientEmail: { type: "string", format: "email", maxLength: 120 },
    },
  },
};

export async function publicRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: PublicBusinessParams }>(
    "/public/businesses/:slug",
    { schema: slugParamsSchema },
    getPublicBusiness,
  );

  app.get<{ Params: PublicSlotsParams }>(
    "/public/businesses/:slug/employees/:employeeId/slots",
    { schema: slotsParamsSchema },
    listPublicSlots,
  );

  app.post<{ Params: PublicBusinessParams; Body: PublicBookingBody }>(
    "/public/businesses/:slug/bookings",
    { schema: bookingSchema },
    createPublicBooking,
  );
}
