import { FastifyInstance } from "fastify";
import {
  acceptInvite,
  changePassword,
  login,
  me,
  updateMe,
  ChangePasswordBody,
  UpdateMeBody,
} from "../controllers/authController";
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

const updateMeSchema = {
  body: {
    type: "object",
    required: ["name", "email"],
    additionalProperties: false,
    properties: {
      name: { type: "string", minLength: 1 },
      email: { type: "string", format: "email" },
      // Opcional aqui de propósito: só é exigido quando o e-mail muda, e JSON
      // Schema não expressa "obrigatório se divergir do estado atual".
      currentPassword: { type: "string", minLength: 1 },
    },
  },
};

const changePasswordSchema = {
  body: {
    type: "object",
    required: ["currentPassword", "newPassword"],
    additionalProperties: false,
    properties: {
      currentPassword: { type: "string", minLength: 1 },
      // Mesmo mínimo do accept-invite: o convite e a troca não podem divergir.
      newPassword: { type: "string", minLength: 8 },
    },
  },
};

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post("/auth/login", { schema: loginSchema }, login);
  app.post("/auth/accept-invite", { schema: acceptInviteSchema }, acceptInvite);
  app.get("/auth/me", { preHandler: [authenticate] }, me);

  app.put<{ Body: UpdateMeBody }>(
    "/auth/me",
    { schema: updateMeSchema, preHandler: [authenticate] },
    updateMe,
  );

  app.put<{ Body: ChangePasswordBody }>(
    "/auth/me/password",
    { schema: changePasswordSchema, preHandler: [authenticate] },
    changePassword,
  );
}
