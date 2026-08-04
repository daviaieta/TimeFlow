-- Fase 1 do CRM (docs/2026-07-30-crm-architecture.md): só estrutura.
-- Nenhuma rota, nenhuma leitura, nenhuma escrita — o objetivo desta migration
-- é medir o custo de criação das tabelas e dos índices ANTES de qualquer
-- comportamento depender delas.
--
-- Gerada com `prisma migrate diff` e editada à mão para acrescentar a trava de
-- somente-acréscimo do CustomerMergeLog, no fim do arquivo.
--
-- Em volume de produção, os índices desta migration devem ser criados
-- CONCURRENTLY fora dela antes do deploy — o Prisma envolve cada arquivo numa
-- transação, e CREATE INDEX CONCURRENTLY não roda dentro de uma. As tabelas
-- aqui nascem vazias, então o custo é do índice em si, não de reindexar dado
-- existente; a exceção é o Booking, que já tem linhas.

-- CreateEnum
CREATE TYPE "CustomerIdentityState" AS ENUM ('PROVISIONAL', 'ACTIVE', 'SUSPENDED', 'ERASED');

-- CreateEnum
CREATE TYPE "CustomerProfileStatus" AS ENUM ('ACTIVE', 'BLOCKED');

-- CreateEnum
CREATE TYPE "VerificationChannel" AS ENUM ('EMAIL', 'PHONE');

-- CreateEnum
CREATE TYPE "VerificationPurpose" AS ENUM ('SIGNUP', 'LOGIN', 'ADD_CHANNEL', 'CLAIM_HISTORY', 'PASSWORD_RESET');

-- CreateEnum
CREATE TYPE "LoyaltyEntryKind" AS ENUM ('EARN', 'REDEEM', 'ADJUST', 'EXPIRE');

-- CreateEnum
CREATE TYPE "CustomerLinkSource" AS ENUM ('PUBLIC_BOOKING', 'STAFF', 'MIGRATION', 'CLAIM');

-- CreateEnum
CREATE TYPE "CustomerMergeActor" AS ENUM ('CUSTOMER', 'STAFF', 'SYSTEM');

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "idempotencyKey" TEXT,
ADD COLUMN     "profileId" INTEGER;

-- CreateTable
CREATE TABLE "Customer" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publicId" UUID NOT NULL DEFAULT gen_random_uuid(),
    "state" "CustomerIdentityState" NOT NULL DEFAULT 'PROVISIONAL',
    "name" TEXT NOT NULL,
    "email" TEXT,
    "emailVerifiedAt" TIMESTAMP(3),
    "phoneE164" TEXT,
    "phoneVerifiedAt" TIMESTAMP(3),
    "passwordHash" TEXT,
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "mergedIntoId" INTEGER,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerSession" (
    "id" BIGSERIAL NOT NULL,
    "publicId" UUID NOT NULL DEFAULT gen_random_uuid(),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "customerId" INTEGER NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "replacedById" BIGINT,
    "revokedAt" TIMESTAMP(3),
    "userAgent" TEXT,
    "ipPrefix" TEXT,

    CONSTRAINT "CustomerSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerVerification" (
    "id" BIGSERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "customerId" INTEGER NOT NULL,
    "channel" "VerificationChannel" NOT NULL,
    "purpose" "VerificationPurpose" NOT NULL,
    "destination" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "businessId" INTEGER,

    CONSTRAINT "CustomerVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerProfile" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publicId" UUID NOT NULL DEFAULT gen_random_uuid(),
    "customerId" INTEGER NOT NULL,
    "businessId" INTEGER NOT NULL,
    "source" "CustomerLinkSource" NOT NULL,
    "status" "CustomerProfileStatus" NOT NULL DEFAULT 'ACTIVE',
    "displayName" TEXT NOT NULL,
    "displayPhone" TEXT,
    "displayEmail" TEXT,
    "bookingsCount" INTEGER NOT NULL DEFAULT 0,
    "completedCount" INTEGER NOT NULL DEFAULT 0,
    "noShowCount" INTEGER NOT NULL DEFAULT 0,
    "canceledCount" INTEGER NOT NULL DEFAULT 0,
    "totalSpent" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "spendIsEstimated" BOOLEAN NOT NULL DEFAULT false,
    "loyaltyPoints" INTEGER NOT NULL DEFAULT 0,
    "firstBookedAt" TIMESTAMP(3),
    "lastBookedAt" TIMESTAMP(3),

    CONSTRAINT "CustomerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerNote" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "profileId" INTEGER NOT NULL,
    "businessId" INTEGER NOT NULL,
    "authorId" INTEGER,
    "body" TEXT NOT NULL,
    "visibleToCustomer" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "CustomerNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerTag" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "businessId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,

    CONSTRAINT "CustomerTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerProfileTag" (
    "profileId" INTEGER NOT NULL,
    "tagId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerProfileTag_pkey" PRIMARY KEY ("profileId","tagId")
);

-- CreateTable
CREATE TABLE "LoyaltyEntry" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "profileId" INTEGER NOT NULL,
    "businessId" INTEGER NOT NULL,
    "kind" "LoyaltyEntryKind" NOT NULL,
    "points" INTEGER NOT NULL,
    "bookingId" INTEGER,
    "reason" TEXT,
    "authorId" INTEGER,
    "idempotencyKey" TEXT,

    CONSTRAINT "LoyaltyEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerMergeLog" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "winnerId" INTEGER NOT NULL,
    "loserId" INTEGER NOT NULL,
    "businessId" INTEGER NOT NULL,
    "movedBookings" INTEGER NOT NULL DEFAULT 0,
    "movedNotes" INTEGER NOT NULL DEFAULT 0,
    "movedLoyalty" INTEGER NOT NULL DEFAULT 0,
    "profilesCollapsed" BOOLEAN NOT NULL DEFAULT false,
    "actor" "CustomerMergeActor" NOT NULL,
    "actorUserId" INTEGER,

    CONSTRAINT "CustomerMergeLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessCrmSettings" (
    "businessId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "loyaltyEnabled" BOOLEAN NOT NULL DEFAULT false,
    "pointsPerUnit" INTEGER NOT NULL DEFAULT 1,
    "pointsExpireAfterDays" INTEGER,
    "customerLoginEnabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "BusinessCrmSettings_pkey" PRIMARY KEY ("businessId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Customer_publicId_key" ON "Customer"("publicId");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_email_key" ON "Customer"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_phoneE164_key" ON "Customer"("phoneE164");

-- CreateIndex
CREATE INDEX "Customer_state_idx" ON "Customer"("state");

-- CreateIndex
CREATE INDEX "Customer_mergedIntoId_idx" ON "Customer"("mergedIntoId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerSession_publicId_key" ON "CustomerSession"("publicId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerSession_refreshTokenHash_key" ON "CustomerSession"("refreshTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerSession_replacedById_key" ON "CustomerSession"("replacedById");

-- CreateIndex
CREATE INDEX "CustomerSession_customerId_revokedAt_idx" ON "CustomerSession"("customerId", "revokedAt");

-- CreateIndex
CREATE INDEX "CustomerSession_expiresAt_idx" ON "CustomerSession"("expiresAt");

-- CreateIndex
CREATE INDEX "CustomerVerification_customerId_purpose_consumedAt_idx" ON "CustomerVerification"("customerId", "purpose", "consumedAt");

-- CreateIndex
CREATE INDEX "CustomerVerification_expiresAt_idx" ON "CustomerVerification"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerProfile_publicId_key" ON "CustomerProfile"("publicId");

-- CreateIndex
CREATE INDEX "CustomerProfile_businessId_lastBookedAt_idx" ON "CustomerProfile"("businessId", "lastBookedAt" DESC);

-- CreateIndex
CREATE INDEX "CustomerProfile_businessId_status_displayName_idx" ON "CustomerProfile"("businessId", "status", "displayName");

-- CreateIndex
CREATE INDEX "CustomerProfile_businessId_createdAt_idx" ON "CustomerProfile"("businessId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerProfile_customerId_businessId_key" ON "CustomerProfile"("customerId", "businessId");

-- CreateIndex
CREATE INDEX "CustomerNote_profileId_createdAt_idx" ON "CustomerNote"("profileId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "CustomerNote_businessId_createdAt_idx" ON "CustomerNote"("businessId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerTag_businessId_name_key" ON "CustomerTag"("businessId", "name");

-- CreateIndex
CREATE INDEX "CustomerProfileTag_tagId_idx" ON "CustomerProfileTag"("tagId");

-- CreateIndex
CREATE INDEX "LoyaltyEntry_profileId_createdAt_idx" ON "LoyaltyEntry"("profileId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "LoyaltyEntry_businessId_kind_createdAt_idx" ON "LoyaltyEntry"("businessId", "kind", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyEntry_businessId_idempotencyKey_key" ON "LoyaltyEntry"("businessId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "CustomerMergeLog_winnerId_createdAt_idx" ON "CustomerMergeLog"("winnerId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "CustomerMergeLog_loserId_idx" ON "CustomerMergeLog"("loserId");

-- CreateIndex
CREATE INDEX "CustomerMergeLog_businessId_createdAt_idx" ON "CustomerMergeLog"("businessId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Booking_profileId_createdAt_idx" ON "Booking"("profileId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "Booking_businessId_idempotencyKey_key" ON "Booking"("businessId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "CustomerProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerSession" ADD CONSTRAINT "CustomerSession_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerSession" ADD CONSTRAINT "CustomerSession_replacedById_fkey" FOREIGN KEY ("replacedById") REFERENCES "CustomerSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerVerification" ADD CONSTRAINT "CustomerVerification_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerVerification" ADD CONSTRAINT "CustomerVerification_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerProfile" ADD CONSTRAINT "CustomerProfile_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerProfile" ADD CONSTRAINT "CustomerProfile_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerNote" ADD CONSTRAINT "CustomerNote_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "CustomerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerNote" ADD CONSTRAINT "CustomerNote_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerNote" ADD CONSTRAINT "CustomerNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerTag" ADD CONSTRAINT "CustomerTag_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerProfileTag" ADD CONSTRAINT "CustomerProfileTag_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "CustomerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerProfileTag" ADD CONSTRAINT "CustomerProfileTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "CustomerTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyEntry" ADD CONSTRAINT "LoyaltyEntry_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "CustomerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyEntry" ADD CONSTRAINT "LoyaltyEntry_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyEntry" ADD CONSTRAINT "LoyaltyEntry_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyEntry" ADD CONSTRAINT "LoyaltyEntry_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerMergeLog" ADD CONSTRAINT "CustomerMergeLog_winnerId_fkey" FOREIGN KEY ("winnerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerMergeLog" ADD CONSTRAINT "CustomerMergeLog_loserId_fkey" FOREIGN KEY ("loserId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerMergeLog" ADD CONSTRAINT "CustomerMergeLog_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerMergeLog" ADD CONSTRAINT "CustomerMergeLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessCrmSettings" ADD CONSTRAINT "BusinessCrmSettings_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Trava de somente-acréscimo no CustomerMergeLog.
--
-- Fundir duas identidades é a única operação destrutiva do CRM: prontuários
-- mudam de dono e, no pior caso, um deles deixa de existir. Este log é o que
-- torna a operação reversível à mão, então ele não pode depender de um
-- combinado de camada — a camada de repositório não expõe update nem delete,
-- e o banco garante que nenhum código futuro consiga contornar isso.
--
-- Gatilho de LINHA de propósito: TRUNCATE não dispara gatilho de linha, e é
-- por TRUNCATE que a suíte de integração limpa esta tabela entre testes. A
-- trava protege do bug de aplicação sem inviabilizar o reset dos testes.
--
-- O Prisma não gerencia funções nem gatilhos: isto não gera drift de schema e
-- sobrevive às próximas migrations.
CREATE OR REPLACE FUNCTION "crm_merge_log_append_only"() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'CustomerMergeLog e somente de acrescimo: % recusado na linha %', TG_OP, OLD."id"
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "CustomerMergeLog_append_only"
  BEFORE UPDATE OR DELETE ON "CustomerMergeLog"
  FOR EACH ROW EXECUTE FUNCTION "crm_merge_log_append_only"();

