/*
  Warnings:

  - You are about to drop the column `clientName` on the `Availability` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "BookingSource" AS ENUM ('ONLINE', 'INTERNAL');

-- AlterTable
ALTER TABLE "Availability" DROP COLUMN "clientName";

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "source" "BookingSource" NOT NULL DEFAULT 'ONLINE';
