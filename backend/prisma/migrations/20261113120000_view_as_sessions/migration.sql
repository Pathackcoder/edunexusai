-- View-As: read-only administrator support access (additive: one enum, two new tables, no existing table changed).
-- CreateEnum
CREATE TYPE "ViewAsStatus" AS ENUM ('ACTIVE', 'ENDED', 'EXPIRED', 'REVOKED');

-- CreateTable
CREATE TABLE "view_as_sessions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "subjectUserId" TEXT NOT NULL,
    "persona" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'READ_ONLY',
    "reason" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" "ViewAsStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "endReason" TEXT,
    "requestCount" INTEGER NOT NULL DEFAULT 0,
    "blockedCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "view_as_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "view_as_access_events" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "status" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "view_as_access_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "view_as_sessions_tokenHash_key" ON "view_as_sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "view_as_sessions_tenantId_actorUserId_status_idx" ON "view_as_sessions"("tenantId", "actorUserId", "status");

-- CreateIndex
CREATE INDEX "view_as_sessions_subjectUserId_createdAt_idx" ON "view_as_sessions"("subjectUserId", "createdAt");

-- CreateIndex
CREATE INDEX "view_as_access_events_sessionId_createdAt_idx" ON "view_as_access_events"("sessionId", "createdAt");

-- AddForeignKey
ALTER TABLE "view_as_sessions" ADD CONSTRAINT "view_as_sessions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "view_as_sessions" ADD CONSTRAINT "view_as_sessions_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "view_as_sessions" ADD CONSTRAINT "view_as_sessions_subjectUserId_fkey" FOREIGN KEY ("subjectUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "view_as_access_events" ADD CONSTRAINT "view_as_access_events_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "view_as_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

