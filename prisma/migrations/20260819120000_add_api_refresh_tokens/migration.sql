-- CreateTable
CREATE TABLE "ApiRefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "externalAppId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "replacedByTokenId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "ApiRefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ApiRefreshToken_tokenHash_key" ON "ApiRefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "ApiRefreshToken_userId_externalAppId_idx" ON "ApiRefreshToken"("userId", "externalAppId");

-- CreateIndex
CREATE INDEX "ApiRefreshToken_familyId_idx" ON "ApiRefreshToken"("familyId");

-- CreateIndex
CREATE INDEX "ApiRefreshToken_expiresAt_idx" ON "ApiRefreshToken"("expiresAt");

-- CreateIndex
CREATE INDEX "ApiRefreshToken_revokedAt_idx" ON "ApiRefreshToken"("revokedAt");

-- CreateIndex
CREATE INDEX "ApiRefreshToken_replacedByTokenId_idx" ON "ApiRefreshToken"("replacedByTokenId");

-- AddForeignKey
ALTER TABLE "ApiRefreshToken" ADD CONSTRAINT "ApiRefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiRefreshToken" ADD CONSTRAINT "ApiRefreshToken_externalAppId_fkey" FOREIGN KEY ("externalAppId") REFERENCES "ExternalApp"("id") ON DELETE CASCADE ON UPDATE CASCADE;
