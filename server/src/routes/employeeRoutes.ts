import { Role } from "@prisma/client";
import { FastifyInstance } from "fastify";
import {
  createEmployee,
  deleteEmployee,
  linkService,
  listEmployees,
  unlinkService,
  CreateEmployeeBody,
  EmployeeParams,
  LinkServiceBody,
  UnlinkServiceParams,
} from "../controllers/employeeController";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";

const createEmployeeSchema = {
  body: {
    type: "object",
    required: ["name", "email"],
    additionalProperties: false,
    properties: {
      name: { type: "string", minLength: 1 },
      email: { type: "string", format: "email" },
    },
  },
};

const employeeParamsSchema = {
  params: {
    type: "object",
    required: ["id"],
    properties: {
      id: { type: "integer" },
    },
  },
};

const linkServiceSchema = {
  ...employeeParamsSchema,
  body: {
    type: "object",
    required: ["serviceId"],
    additionalProperties: false,
    properties: {
      serviceId: { type: "integer" },
    },
  },
};

const unlinkServiceParamsSchema = {
  params: {
    type: "object",
    required: ["id", "serviceId"],
    additionalProperties: false,
    properties: {
      id: { type: "integer" },
      serviceId: { type: "integer" },
    },
  },
};

export async function employeeRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: CreateEmployeeBody }>(
    "/employees",
    {
      schema: createEmployeeSchema,
      preHandler: [authenticate, authorize(Role.ADMIN)],
    },
    createEmployee,
  );

  app.get(
    "/employees",
    { preHandler: [authenticate, authorize(Role.ADMIN, Role.EMPLOYEE)] },
    listEmployees,
  );

  app.delete<{ Params: EmployeeParams }>(
    "/employees/:id",
    {
      schema: employeeParamsSchema,
      preHandler: [authenticate, authorize(Role.ADMIN)],
    },
    deleteEmployee,
  );

  app.post<{ Params: EmployeeParams; Body: LinkServiceBody }>(
    "/employees/:id/services",
    {
      schema: linkServiceSchema,
      preHandler: [authenticate, authorize(Role.ADMIN)],
    },
    linkService,
  );

  app.delete<{ Params: UnlinkServiceParams }>(
    "/employees/:id/services/:serviceId",
    {
      schema: unlinkServiceParamsSchema,
      preHandler: [authenticate, authorize(Role.ADMIN)],
    },
    unlinkService,
  );
}
