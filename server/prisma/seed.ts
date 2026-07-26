import { PrismaClient, Role } from "@prisma/client";
import { hashPassword } from "../src/lib/password";
import { generateInviteToken } from "../src/lib/inviteToken";
import { resolveSeedCredentials, shouldSeedTestInvite } from "./seedCredentials";

const prisma = new PrismaClient();

const NODE_ENV = process.env.NODE_ENV ?? "development";
const { email: SUPERADMIN_EMAIL, password: SUPERADMIN_PASSWORD } =
  resolveSeedCredentials({
    nodeEnv: NODE_ENV,
    email: process.env.SEED_SUPERADMIN_EMAIL,
    password: process.env.SEED_SUPERADMIN_PASSWORD,
  });
const PENDING_INVITE_EMAIL =
  process.env.SEED_PENDING_INVITE_EMAIL ?? "convite-teste@timeflow.com";

async function seedSuperadmin(): Promise<void> {
  const existing = await prisma.user.findUnique({ where: { email: SUPERADMIN_EMAIL } });
  if (existing) {
    console.log("Superadmin already exists:", SUPERADMIN_EMAIL);
    return;
  }

  await prisma.user.create({
    data: {
      name: "Super Admin",
      email: SUPERADMIN_EMAIL,
      password: await hashPassword(SUPERADMIN_PASSWORD),
      role: Role.SUPERADMIN,
    },
  });

  console.log("Superadmin created:", SUPERADMIN_EMAIL, "/", SUPERADMIN_PASSWORD);
}

async function seedPendingInvite(): Promise<void> {
  const existing = await prisma.user.findUnique({ where: { email: PENDING_INVITE_EMAIL } });
  if (existing?.password) {
    console.log("Pending invite user already accepted, skipping:", PENDING_INVITE_EMAIL);
    return;
  }

  const { token, expiresAt } = generateInviteToken();

  await prisma.user.upsert({
    where: { email: PENDING_INVITE_EMAIL },
    update: { inviteToken: token, inviteTokenExpiresAt: expiresAt },
    create: {
      name: "Convite de Teste",
      email: PENDING_INVITE_EMAIL,
      role: Role.ADMIN,
      inviteToken: token,
      inviteTokenExpiresAt: expiresAt,
    },
  });

  console.log("Pending invite ready:", PENDING_INVITE_EMAIL, "/ inviteToken:", token);
}

async function main(): Promise<void> {
  await seedSuperadmin();

  if (shouldSeedTestInvite(NODE_ENV)) {
    await seedPendingInvite();
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
