-- Uma reserva passa a ocupar N slots consecutivos: a chave estrangeira migra
-- de Booking.availabilityId para Availability.bookingId. Escrita à mão porque
-- o passo gerado dropava a coluna antiga sem transferir os vínculos.

-- AlterTable
ALTER TABLE "Availability" ADD COLUMN "bookingId" INTEGER;

-- Backfill: cada reserva existente continua dona do seu slot original.
UPDATE "Availability" a
SET "bookingId" = b."id"
FROM "Booking" b
WHERE b."availabilityId" = a."id";

-- DropForeignKey
ALTER TABLE "Booking" DROP CONSTRAINT "Booking_availabilityId_fkey";

-- DropIndex
DROP INDEX "Booking_availabilityId_key";

-- AlterTable
ALTER TABLE "Booking" DROP COLUMN "availabilityId";

-- CreateIndex
CREATE INDEX "Availability_bookingId_idx" ON "Availability"("bookingId");

-- AddForeignKey
ALTER TABLE "Availability" ADD CONSTRAINT "Availability_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;
