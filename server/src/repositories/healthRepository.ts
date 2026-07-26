import { prisma } from "../lib/prisma";

export const healthRepository = {
  async isReachable(): Promise<boolean> {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  },
};
