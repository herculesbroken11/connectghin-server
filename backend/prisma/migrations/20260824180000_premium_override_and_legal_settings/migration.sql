-- Premium admin override (distinct from store Subscription rows)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "premiumOverride" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "premiumOverrideExpiresAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "premiumOverrideReason" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "premiumOverrideUpdatedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "premiumOverrideByAdminId" TEXT;

CREATE INDEX IF NOT EXISTS "User_premiumOverride_premiumOverrideExpiresAt_idx"
  ON "User"("premiumOverride", "premiumOverrideExpiresAt");

-- Public legal / contact settings (non-secret). Placeholders — admin must confirm privacy mailbox / address.
INSERT INTO "AppSettings" ("id", "key", "valueJson", "updatedAt")
SELECT gen_random_uuid()::text, v.key, v.valueJson::jsonb, NOW()
FROM (VALUES
  ('privacy_contact_email', '"support@connectghin.com"'),
  ('support_email', '"support@connectghin.com"'),
  ('company_display_name', '"Connectghin"'),
  ('business_mailing_address', '""'),
  ('terms_url', '""'),
  ('privacy_url', '""')
) AS v(key, valueJson)
WHERE NOT EXISTS (SELECT 1 FROM "AppSettings" s WHERE s."key" = v.key);
