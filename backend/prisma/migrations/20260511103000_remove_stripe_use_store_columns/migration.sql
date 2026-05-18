-- Subscriptions: Apple App Store / Google Play only (remove Stripe-era columns and enum value).

UPDATE "Subscription" SET "provider" = 'APPLE_APP_STORE' WHERE "provider"::text = 'STRIPE';

CREATE TYPE "SubscriptionProvider_new" AS ENUM ('APPLE_APP_STORE', 'GOOGLE_PLAY');

ALTER TABLE "Subscription" ALTER COLUMN "provider" TYPE "SubscriptionProvider_new" USING (
  CASE
    WHEN "provider"::text = 'GOOGLE_PLAY' THEN 'GOOGLE_PLAY'::"SubscriptionProvider_new"
    ELSE 'APPLE_APP_STORE'::"SubscriptionProvider_new"
  END
);

DROP TYPE "SubscriptionProvider";
ALTER TYPE "SubscriptionProvider_new" RENAME TO "SubscriptionProvider";

DROP INDEX IF EXISTS "User_stripeCustomerId_key";
ALTER TABLE "User" DROP COLUMN IF EXISTS "stripeCustomerId";

ALTER TABLE "Subscription" DROP COLUMN IF EXISTS "stripeCustomerId";
ALTER TABLE "Subscription" RENAME COLUMN "stripeSubscriptionId" TO "storeExternalId";
ALTER TABLE "Subscription" RENAME COLUMN "stripePriceId" TO "storeProductId";

ALTER TABLE "PaymentEvent" RENAME COLUMN "stripeEventId" TO "idempotencyKey";
