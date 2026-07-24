import { Role } from "@prisma/client";
import { FastifyInstance } from "fastify";
import {
  createEmployee,
  deleteEmployee,
  linkService,
  listEmployees,
  CreateEmployeeBody,
  EmployeeParams,
  LinkServiceBody,
} from "../controllers/employeeController";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";

const createEmployeeSchema = {
  body: {
    type: "object",
    required: ["name", "email"],
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
    properties: {
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
}
