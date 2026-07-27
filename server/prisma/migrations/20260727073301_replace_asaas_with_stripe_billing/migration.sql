-- DropIndex
DROP INDEX "Business_asaasCustomerId_key";

-- DropIndex
DROP INDEX "Business_asaasSubscriptionId_key";

-- AlterTable
ALTER TABLE "Business" DROP COLUMN "asaasCustomerId",
DROP COLUMN "asaasSubscriptionId",
DROP COLUMN "cpfCnpj",
ADD COLUMN     "stripeCustomerId" TEXT,
ADD COLUMN     "stripeSubscriptionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Business_stripeCustomerId_key" ON "Business"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "Business_stripeSubscriptionId_key" ON "Business"("stripeSubscriptionId");
