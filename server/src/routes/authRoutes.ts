import { FastifyInstance } from "fastify";
import { acceptInvite, login, me } from "../controllers/authController";
import { authenticate } from "../middlewares/authenticate";

const loginSchema = {
  body: {
    type: "object",
    required: ["email", "password"],
    additionalProperties: false,
    properties: {
      email: { type: "string" },
      password: { type: "string", minLength: 1 },
    },
  },
};

const acceptInviteSchema = {
  body: {
    type: "object",
    required: ["token", "password"],
    additionalProperties: false,
    properties: {
      token: { type: "string", minLength: 1 },
      password: { type: "string", minLength: 8 },
    },
  },
};

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post("/auth/login", { schema: loginSchema }, login);
  app.post("/auth/accept-invite", { schema: acceptInviteSchema }, acceptInvite);
  app.get("/auth/me", { preHandler: [authenticate] }, me);
}
