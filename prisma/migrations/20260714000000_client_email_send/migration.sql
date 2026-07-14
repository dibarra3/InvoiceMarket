-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "clientEmail" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "sentAt" TIMESTAMP(3);

