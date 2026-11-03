-- Institutional sign-in sessions and the shared single-use hand-off store.
-- Additive only: two new tables; nothing existing changes.
-- Rollback (before use): DROP TABLE "sso_handoffs"; DROP TABLE "sso_sessions";
-- and delete this migration's row from "_prisma_migrations".

-- CreateTable
CREATE TABLE "sso_sessions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "idpSessionId" TEXT,
    "idTokenSealed" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "endedReason" TEXT,

    CONSTRAINT "sso_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sso_handoffs" (
    "codeHash" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ssoSessionId" TEXT NOT NULL,
    "returnTo" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sso_handoffs_pkey" PRIMARY KEY ("codeHash")
);

-- CreateIndex
CREATE INDEX "sso_sessions_userId_idx" ON "sso_sessions"("userId");

-- CreateIndex
CREATE INDEX "sso_sessions_providerId_idpSessionId_idx" ON "sso_sessions"("providerId", "idpSessionId");

-- CreateIndex
CREATE INDEX "sso_sessions_providerId_subject_idx" ON "sso_sessions"("providerId", "subject");

-- CreateIndex
CREATE INDEX "sso_handoffs_expiresAt_idx" ON "sso_handoffs"("expiresAt");

-- AddForeignKey
ALTER TABLE "sso_sessions" ADD CONSTRAINT "sso_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sso_sessions" ADD CONSTRAINT "sso_sessions_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "identity_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

