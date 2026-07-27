import { Role } from "@prisma/client";
import { FastifyInstance } from "fastify";
import { createBooking } from "../controllers/bookingController";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";
import { requireActiveSubscription } from "../middlewares/requireActiveSubscription";
import { CreateBookingInput } from "../services/bookingService";

const createBookingSchema = {
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

export async function bookingRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: CreateBookingInput }>(
    "/bookings",
    {
      schema: createBookingSchema,
      preHandler: [
        authenticate,
        requireActiveSubscription,
        authorize(Role.ADMIN, Role.EMPLOYEE),
      ],
    },
    createBooking,
  );
}
