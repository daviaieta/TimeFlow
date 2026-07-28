import { FastifyInstance } from "fastify";
import { ContactBody, createContactMessage } from "../controllers/contactController";
import {
  createPublicBooking,
  getPublicBusiness,
  listPublicSlots,
  PublicBookingBody,
  PublicBusinessParams,
  PublicSlotsParams,
  PublicSlotsQuery,
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

// serviceId é obrigatório: a lista de horários depende da duração do serviço,
// então não existe "horários deste profissional" sem saber o que ele vai fazer.
const slotsSchema = {
  params: {
    type: "object",
    required: ["slug", "employeeId"],
    additionalProperties: false,
    properties: {
      slug: { type: "string", minLength: 1 },
      employeeId: { type: "integer" },
    },
  },
  querystring: {
    type: "object",
    required: ["serviceId"],
    additionalProperties: false,
    properties: {
      serviceId: { type: "integer" },
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

// `website` é o honeypot: aceito no schema de propósito, para o bot receber
// 201 e não descobrir que o campo o denunciou. A rejeição é na regra.
const contactSchema = {
  body: {
    type: "object",
    required: ["name", "email", "message"],
    additionalProperties: false,
    properties: {
      name: { type: "string", minLength: 1, maxLength: 80 },
      email: { type: "string", format: "email", maxLength: 120 },
      phone: { type: "string", maxLength: 20 },
      businessName: { type: "string", maxLength: 80 },
      teamSize: { type: "string", enum: ["1", "2-5", "6+"] },
      message: { type: "string", minLength: 1, maxLength: 2000 },
      website: { type: "string", maxLength: 200 },
    },
  },
};

export async function publicRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: PublicBusinessParams }>(
    "/public/businesses/:slug",
    { schema: slugParamsSchema },
    getPublicBusiness,
  );

  app.get<{ Params: PublicSlotsParams; Querystring: PublicSlotsQuery }>(
    "/public/businesses/:slug/employees/:employeeId/slots",
    { schema: slotsSchema },
    listPublicSlots,
  );

  app.post<{ Params: PublicBusinessParams; Body: PublicBookingBody }>(
    "/public/businesses/:slug/bookings",
    { schema: bookingSchema },
    createPublicBooking,
  );

  app.post<{ Body: ContactBody }>(
    "/public/contact",
    { schema: contactSchema },
    createContactMessage,
  );
}
