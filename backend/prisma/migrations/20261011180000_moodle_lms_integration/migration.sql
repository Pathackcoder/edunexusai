-- AlterEnum
ALTER TYPE "IntegrationProvider" ADD VALUE 'MOODLE';

-- AlterTable
ALTER TABLE "external_identities" ADD COLUMN     "exclusiveInternalId" TEXT,
ADD COLUMN     "linkMethod" TEXT,
ADD COLUMN     "linkedByUserId" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "verifiedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "integration_operations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "entityType" TEXT NOT NULL,
    "internalId" TEXT,
    "externalId" TEXT,
    "request" JSONB,
    "result" JSONB,
    "errorKind" TEXT,
    "errorMessage" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "correlationId" TEXT NOT NULL,
    "triggeredByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "integration_operations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "integration_operations_tenantId_status_idx" ON "integration_operations"("tenantId", "status");

-- CreateIndex
CREATE INDEX "integration_operations_integrationId_createdAt_idx" ON "integration_operations"("integrationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "integration_operations_tenantId_idempotencyKey_key" ON "integration_operations"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "external_identities_tenantId_provider_entityType_exclusiveI_key" ON "external_identities"("tenantId", "provider", "entityType", "exclusiveInternalId");

-- AddForeignKey
ALTER TABLE "integration_operations" ADD CONSTRAINT "integration_operations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_operations" ADD CONSTRAINT "integration_operations_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Guard the small state machines at the database level.
ALTER TABLE "integration_operations" ADD CONSTRAINT "integration_operations_status_check"
  CHECK ("status" IN ('PENDING', 'SUCCEEDED', 'FAILED', 'NEEDS_RECONCILIATION', 'BLOCKED'));
ALTER TABLE "external_identities" ADD CONSTRAINT "external_identities_status_check"
  CHECK ("status" IN ('ACTIVE', 'SUSPENDED'));
-- A one-to-one key, when present, must be the row's own internalId.
ALTER TABLE "external_identities" ADD CONSTRAINT "external_identities_exclusive_matches_internal"
  CHECK ("exclusiveInternalId" IS NULL OR "exclusiveInternalId" = "internalId");
