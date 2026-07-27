-- Profile social posts (text and/or image).
CREATE TABLE IF NOT EXISTS "ProfilePost" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "body" TEXT,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProfilePost_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ProfilePost_userId_createdAt_idx" ON "ProfilePost"("userId", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ProfilePost_userId_fkey'
  ) THEN
    ALTER TABLE "ProfilePost"
      ADD CONSTRAINT "ProfilePost_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
