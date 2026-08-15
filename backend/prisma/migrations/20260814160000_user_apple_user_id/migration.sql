-- Sign in with Apple: stable user identifier (JWT `sub`). Email is only
-- guaranteed on the first authorization, so lookups must not rely on email alone.

ALTER TABLE "User" ADD COLUMN "appleUserId" TEXT;
CREATE UNIQUE INDEX "User_appleUserId_key" ON "User"("appleUserId");
