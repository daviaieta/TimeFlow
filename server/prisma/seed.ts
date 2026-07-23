import { PrismaClient, Role } from "@prisma/client";
import { hashPassword } from "../src/lib/password";
import { generateInviteToken } from "../src/lib/inviteToken";

const prisma = new PrismaClient();

const SUPERADMIN_EMAIL = process.env.SEED_SUPERADMIN_EMAIL ?? "superadmin@timeflow.com";
const SUPERADMIN_PASSWORD = process.env.SEED_SUPERADMIN_PASSWORD ?? "SuperAdmin123!";
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
  await seedPendingInvite();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
