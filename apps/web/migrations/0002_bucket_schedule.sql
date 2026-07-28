-- AlterTable
ALTER TABLE "Bucket" ADD COLUMN "workDays" TEXT;
ALTER TABLE "Bucket" ADD COLUMN "startMinutes" INTEGER;
ALTER TABLE "Bucket" ADD COLUMN "endMinutes" INTEGER;
ALTER TABLE "Bucket" ADD COLUMN "breakStartMinutes" INTEGER;
ALTER TABLE "Bucket" ADD COLUMN "breakEndMinutes" INTEGER;
