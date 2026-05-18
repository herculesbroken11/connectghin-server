-- AlterTable
ALTER TABLE "PrivacySettings" ADD COLUMN "showLastActive" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PrivacySettings" ADD COLUMN "allowMessagesFromMatches" BOOLEAN NOT NULL DEFAULT true;
