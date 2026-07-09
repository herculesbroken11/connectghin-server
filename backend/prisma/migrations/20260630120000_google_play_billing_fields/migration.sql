-- AlterEnum
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'PENDING';
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'REVOKED';

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "purchaseTokenHash" TEXT;
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "orderId" TEXT;
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "expiryDate" TIMESTAMP(3);
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "rawResponse" JSONB;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Subscription_purchaseTokenHash_key" ON "Subscription"("purchaseTokenHash");
CREATE INDEX IF NOT EXISTS "Subscription_orderId_idx" ON "Subscription"("orderId");
