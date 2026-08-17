-- Add per-user access assignments for configurable AppViews.
CREATE UNIQUE INDEX "AppView_contractId_id_key" ON "AppView"("contractId", "id");

CREATE TABLE "UserAppViewAccess" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "appViewId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "UserAppViewAccess_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserAppViewAccess_userId_contractId_appViewId_key"
ON "UserAppViewAccess"("userId", "contractId", "appViewId");

CREATE INDEX "UserAppViewAccess_contractId_appViewId_idx"
ON "UserAppViewAccess"("contractId", "appViewId");

ALTER TABLE "UserAppViewAccess"
ADD CONSTRAINT "UserAppViewAccess_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserAppViewAccess"
ADD CONSTRAINT "UserAppViewAccess_contractId_fkey"
FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserAppViewAccess"
ADD CONSTRAINT "UserAppViewAccess_contractId_appViewId_fkey"
FOREIGN KEY ("contractId", "appViewId") REFERENCES "AppView"("contractId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
