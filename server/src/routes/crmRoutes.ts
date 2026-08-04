import { Role } from "@prisma/client";
import { FastifyInstance } from "fastify";
import {
  createCustomer,
  getCrmMetrics,
  getCrmSettings,
  getCustomer,
  getCustomerBookings,
  listCustomers,
  updateCrmSettings,
  updateCustomer,
  CreateCustomerBody,
  CustomerBookingsQuery,
  CustomerParams,
  ListCustomersQuery,
  UpdateCrmSettingsBody,
  UpdateCustomerBody,
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

// Nome/telefone/e-mail como o negócio conhece. `["string", "null"]` em vez de
// `nullable` porque é JSON Schema padrão e não depende de extensão do ajv: o
// null aqui tem significado no PATCH (apaga o campo), então precisa atravessar
// a validação intacto.
const displayFieldsProperties = {
  displayName: { type: "string", minLength: 1, maxLength: 120 },
  displayPhone: { type: ["string", "null"], maxLength: 32 },
  displayEmail: { type: ["string", "null"], maxLength: 160 },
} as const;

const createCustomerSchema = {
  body: {
    type: "object",
    required: ["displayName"],
    additionalProperties: false,
    properties: displayFieldsProperties,
  },
};

// `minProperties: 1` é a primeira barreira contra PATCH vazio; a regra pura
// repete a checagem porque ela é quem produz a mensagem, e porque um caller
// interno não passa pelo schema.
const updateCustomerSchema = {
  body: {
    type: "object",
    minProperties: 1,
    additionalProperties: false,
    properties: {
      ...displayFieldsProperties,
      status: { type: "string", enum: ["ACTIVE", "BLOCKED"] },
    },
  },
};

const updateCrmSettingsSchema = {
  body: {
    type: "object",
    minProperties: 1,
    additionalProperties: false,
    properties: {
      loyaltyEnabled: { type: "boolean" },
      pointsPerUnit: { type: "integer", minimum: 1, maximum: 1000 },
      // null = ponto que não expira. É valor, não ausência.
      pointsExpireAfterDays: { type: ["integer", "null"], minimum: 1, maximum: 3650 },
      customerLoginEnabled: { type: "boolean" },
    },
  },
};

const emptyQuerystringSchema = {
  querystring: { type: "object", additionalProperties: false, properties: {} },
};

// Quem pode ver prontuário: dono e equipe. Bloquear aqui só é a primeira
// camada; o isolamento real é o businessId na query do repositório.
const staffOrEmployee = authorize(Role.ADMIN, Role.EMPLOYEE);
// Configuração e métricas são do dono: uma muda a regra do negócio, a outra
// agrega a carteira inteira. Nenhuma das duas é trabalho de balcão.
const adminOnly = authorize(Role.ADMIN);

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

  // Cadastro de balcão. É escrita, mas é escrita de atendimento — o funcionário
  // que atende também cadastra, senão o cliente espera o dono chegar.
  app.post<{ Body: CreateCustomerBody }>(
    "/customers",
    {
      schema: createCustomerSchema,
      preHandler: [authenticate, requireActiveSubscription, staffOrEmployee],
    },
    createCustomer,
  );

  app.patch<{ Params: CustomerParams; Body: UpdateCustomerBody }>(
    "/customers/:publicId",
    {
      schema: { ...customerParamsSchema, ...updateCustomerSchema },
      preHandler: [authenticate, requireActiveSubscription, staffOrEmployee],
    },
    updateCustomer,
  );

  app.get(
    "/crm/settings",
    {
      schema: emptyQuerystringSchema,
      preHandler: [authenticate, requireActiveSubscription, adminOnly],
    },
    getCrmSettings,
  );

  app.patch<{ Body: UpdateCrmSettingsBody }>(
    "/crm/settings",
    {
      schema: updateCrmSettingsSchema,
      preHandler: [authenticate, requireActiveSubscription, adminOnly],
    },
    updateCrmSettings,
  );

  app.get(
    "/crm/metrics",
    {
      schema: emptyQuerystringSchema,
      preHandler: [authenticate, requireActiveSubscription, adminOnly],
    },
    getCrmMetrics,
  );
}
