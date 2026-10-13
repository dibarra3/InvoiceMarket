-- CreateEnum
CREATE TYPE "PaymentOutcome" AS ENUM ('APPLIED', 'NEEDS_REVIEW');

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "portalCodeExpiresAt" TIMESTAMP(3),
ADD COLUMN     "portalCodeHash" TEXT;

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "guestAccessCode" TEXT,
ADD COLUMN     "guestToken" TEXT,
ADD COLUMN     "stripeCheckoutAmount" INTEGER;

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerClientLink" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerClientLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "documentId" TEXT,
    "stripeCheckoutSessionId" TEXT NOT NULL,
    "stripePaymentIntentId" TEXT,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "outcome" "PaymentOutcome" NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "livemode" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Customer_email_key" ON "Customer"("email");

-- CreateIndex
CREATE INDEX "CustomerClientLink_clientId_idx" ON "CustomerClientLink"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerClientLink_customerId_clientId_key" ON "CustomerClientLink"("customerId", "clientId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_stripeCheckoutSessionId_key" ON "Payment"("stripeCheckoutSessionId");

-- CreateIndex
CREATE INDEX "Payment_documentId_idx" ON "Payment"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "Client_portalCodeHash_key" ON "Client"("portalCodeHash");

-- CreateIndex
CREATE UNIQUE INDEX "Document_guestToken_key" ON "Document"("guestToken");

-- CreateIndex
CREATE UNIQUE INDEX "Document_guestAccessCode_key" ON "Document"("guestAccessCode");

-- AddForeignKey
ALTER TABLE "CustomerClientLink" ADD CONSTRAINT "CustomerClientLink_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerClientLink" ADD CONSTRAINT "CustomerClientLink_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

