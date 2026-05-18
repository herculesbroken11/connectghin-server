-- Mobile / admin: track primary sign-in method (email vs Google vs Apple).

CREATE TYPE "AuthProvider" AS ENUM ('EMAIL', 'GOOGLE', 'APPLE');

ALTER TABLE "User" ADD COLUMN "authProvider" "AuthProvider" NOT NULL DEFAULT 'EMAIL';
