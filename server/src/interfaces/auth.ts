import { Role } from "@prisma/client";

export interface JwtPayload {
  sub: number;
  role: Role;
  businessId: number | null;
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}
