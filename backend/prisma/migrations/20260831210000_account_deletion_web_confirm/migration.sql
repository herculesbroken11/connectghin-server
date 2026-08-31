-- Web account deletion confirmation tokens (email ownership verification).
CREATE TABLE "AccountDeletionConfirmToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountDeletionConfirmToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccountDeletionConfirmToken_tokenHash_key" ON "AccountDeletionConfirmToken"("tokenHash");
CREATE INDEX "AccountDeletionConfirmToken_userId_expiresAt_idx" ON "AccountDeletionConfirmToken"("userId", "expiresAt");

ALTER TABLE "AccountDeletionConfirmToken" ADD CONSTRAINT "AccountDeletionConfirmToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
