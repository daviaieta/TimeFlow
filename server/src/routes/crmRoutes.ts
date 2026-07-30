import { Role } from "@prisma/client";
import { FastifyInstance } from "fastify";
import {
  getCustomer,
  getCustomerBookings,
  listCustomers,
  CustomerBookingsQuery,
  CustomerParams,
  ListCustomersQuery,
} from "../controllers/crmController";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";
import { requireActiveSubscription } from "../middlewares/requireActiveSubscription";

// Rotas do CRM de negócio (fase 4), §9.3. Tudo ADMIN/EMPLOYEE, autenticado, com
// assinatura ativa (no-op enquanto a cobrança está desligada). O registro em si
// é condicional a env.crmEnabled no app — espelho de billingRoutes: com a flag
// desligada as rotas somem em vez de responderem um erro confuso.

// publicId é o handle opaco §3: uuid v4 do banco. O formato aqui é a primeira
// barreira contra enumeração — um adivinhão de inteiros tropeça em 400 antes
// de carregar o controller.
const customerParamsSchema = {
  params: {
    type: "object",
    required: ["publicId"],
    additionalProperties: false,
    properties: {
      publicId: { type: "string", format: "uuid" },
    },
  },
};

// Querystring da listagem: tudo opcional. `status` e `sort` têm enum aqui só
// para o Fastify rejeitar lixo cedo; o controller ainda tolera o default ao
// invés de explodir, porque o contrato de API não deve exigir o que o painel
// nunca manda.
const listCustomersSchema = {
  querystring: {
    type: "object",
    additionalProperties: false,
    properties: {
      search: { type: "string", maxLength: 80 },
      status: { type: "string", enum: ["ACTIVE", "BLOCKED"] },
      tagId: { type: "integer", minimum: 1 },
      sort: { type: "string", enum: ["recent", "name"] },
      cursor: { type: "string", maxLength: 512 },
      limit: { type: "integer", minimum: 1, maximum: 100 },
    },
  },
};

const customerBookingsSchema = {
  querystring: {
    type: "object",
    additionalProperties: false,
    properties: {
      cursor: { type: "string", maxLength: 512 },
      limit: { type: "integer", minimum: 1, maximum: 100 },
    },
  },
};

// Quem pode ver prontuário: dono e equipe. Bloquear aqui só é a primeira
// camada; o isolamento real é o businessId na query do repositório.
const staffOrEmployee = authorize(Role.ADMIN, Role.EMPLOYEE);

export async function crmRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: ListCustomersQuery }>(
    "/customers",
    {
      schema: listCustomersSchema,
      preHandler: [authenticate, requireActiveSubscription, staffOrEmployee],
    },
    listCustomers,
  );

  app.get<{ Params: CustomerParams }>(
    "/customers/:publicId",
    {
      schema: customerParamsSchema,
      preHandler: [authenticate, requireActiveSubscription, staffOrEmployee],
    },
    getCustomer,
  );

  app.get<{ Params: CustomerParams; Querystring: CustomerBookingsQuery }>(
    "/customers/:publicId/bookings",
    {
      schema: { ...customerParamsSchema, ...customerBookingsSchema },
      preHandler: [authenticate, requireActiveSubscription, staffOrEmployee],
    },
    getCustomerBookings,
  );
}
