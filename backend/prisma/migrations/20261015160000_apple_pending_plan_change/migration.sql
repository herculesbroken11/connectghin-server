-- Apple same-level crossgrades take effect at the next renewal.
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "pendingStoreProductId" TEXT;
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "pendingBillingCycle" "BillingCycle";
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "pendingEffectiveAt" TIMESTAMP(3);
