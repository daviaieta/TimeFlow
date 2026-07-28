/*
  Warnings:

  - You are about to drop the column `clientName` on the `Availability` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "BookingSource" AS ENUM ('ONLINE', 'INTERNAL');

-- Legacy manual-encaixe rows (isBooked=true, bookingId=null, from before this
-- migration) would otherwise become permanently-blocked ghost slots once
-- clientName is gone. Safe no-op if none exist.
UPDATE "Availability" SET "isBooked" = false WHERE "bookingId" IS NULL AND "isBooked" = true;

-- AlterTable
ALTER TABLE "Availability" DROP COLUMN "clientName";

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "source" "BookingSource" NOT NULL DEFAULT 'ONLINE';
