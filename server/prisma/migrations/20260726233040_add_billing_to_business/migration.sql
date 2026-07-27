-- CreateEnum
CREATE TYPE "PlanName" AS ENUM ('ESSENCIAL', 'PROFISSIONAL', 'EQUIPE');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('PENDING', 'ACTIVE', 'PAST_DUE', 'CANCELED');

-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "planName" "PlanName",
ADD COLUMN     "subscriptionStatus" "SubscriptionStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "asaasCustomerId" TEXT,
ADD COLUMN     "asaasSubscriptionId" TEXT,
ADD COLUMN     "cpfCnpj" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Business_asaasCustomerId_key" ON "Business"("asaasCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "Business_asaasSubscriptionId_key" ON "Business"("asaasSubscriptionId");
