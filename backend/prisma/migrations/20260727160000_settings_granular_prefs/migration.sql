-- Granular notification + privacy prefs for Settings screen (dynamic toggles).

ALTER TABLE "PrivacySettings" ADD COLUMN IF NOT EXISTS "showLocation" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "PrivacySettings" ADD COLUMN IF NOT EXISTS "publicProfile" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "UserSettings" ADD COLUMN IF NOT EXISTS "notifyNewMatches" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "UserSettings" ADD COLUMN IF NOT EXISTS "notifyMessages" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "UserSettings" ADD COLUMN IF NOT EXISTS "notifyFoursomeFeed" BOOLEAN NOT NULL DEFAULT false;
