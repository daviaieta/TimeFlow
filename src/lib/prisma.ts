import "dotenv/config";
import { PrismaClient } from "@prisma/client";

// Instância única do PrismaClient, reaproveitada em toda a aplicação.
// Evita abrir múltiplas conexões com o banco em ambiente de desenvolvimento.
export const prisma = new PrismaClient();
