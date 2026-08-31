-- Play compliance: Feed post reports, terms acceptance, deletion failure reason.
CREATE TYPE "ReportTargetType" AS ENUM ('USER', 'FOURSOME_FEED_POST');

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "termsVersion" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "termsAcceptedAt" TIMESTAMP(3);

ALTER TABLE "Report" ADD COLUMN IF NOT EXISTS "targetType" "ReportTargetType" NOT NULL DEFAULT 'USER';
ALTER TABLE "Report" ADD COLUMN IF NOT EXISTS "foursomeFeedPostId" TEXT;

ALTER TABLE "AccountDeletionRequest" ADD COLUMN IF NOT EXISTS "failureReason" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Report_foursomeFeedPostId_fkey'
  ) THEN
    ALTER TABLE "Report"
      ADD CONSTRAINT "Report_foursomeFeedPostId_fkey"
      FOREIGN KEY ("foursomeFeedPostId") REFERENCES "FoursomeFeedPost"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Report_targetType_status_createdAt_idx"
  ON "Report"("targetType", "status", "createdAt");

CREATE INDEX IF NOT EXISTS "Report_foursomeFeedPostId_status_idx"
  ON "Report"("foursomeFeedPostId", "status");

-- One open Feed-post report per reporter/post (allows new report after dismiss/resolve).
CREATE UNIQUE INDEX IF NOT EXISTS "Report_reporter_feed_post_open_uidx"
  ON "Report"("reportedByUserId", "foursomeFeedPostId")
  WHERE "foursomeFeedPostId" IS NOT NULL AND "status" = 'OPEN';
