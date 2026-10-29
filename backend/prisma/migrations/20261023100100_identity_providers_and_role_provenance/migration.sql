-- Institutional sign-in (OpenID Connect), institution-specific role mapping and role provenance.
-- Additive only: four new tables, two new role rows and a provenance backfill. No existing table or
-- column is changed and no existing row is modified or removed.
-- Rollback (before any SSO use): DROP TABLE "role_assignment_sources", "federated_identities",
--   "identity_role_mappings", "identity_providers"; DELETE FROM "roles" WHERE "key" IN ('STAFF','ALUMNI')
--   AND NOT EXISTS (SELECT 1 FROM "user_roles" ur WHERE ur."roleId" = "roles"."id");

INSERT INTO "roles" ("id", "key", "name", "description", "createdAt")
VALUES
  (gen_random_uuid()::text, 'STAFF', 'Staff', 'Institution staff member (community role).', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'ALUMNI', 'Alumni', 'Graduate of the institution (community role).', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

-- CreateTable
CREATE TABLE "identity_providers" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientSecretEnv" TEXT,
    "scopes" TEXT NOT NULL DEFAULT 'openid email profile',
    "studentIdClaim" TEXT,
    "employeeIdClaim" TEXT,
    "employeeIdEstablishesStaff" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "allowInsecureHttp" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "identity_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity_role_mappings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "claim" TEXT NOT NULL,
    "externalValue" TEXT NOT NULL,
    "targetRole" "RoleKey" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "identity_role_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "federated_identities" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "emailAtLink" TEXT,
    "linkMethod" TEXT NOT NULL,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" TIMESTAMP(3),
    "lastEvaluation" JSONB,

    CONSTRAINT "federated_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_assignment_sources" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleKey" "RoleKey" NOT NULL,
    "source" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "providerId" TEXT,
    "grantedByUserId" TEXT,
    "createdRole" BOOLEAN NOT NULL DEFAULT false,
    "evidence" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_assignment_sources_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "identity_providers_tenantId_key_key" ON "identity_providers"("tenantId", "key");

-- CreateIndex
CREATE INDEX "identity_role_mappings_tenantId_idx" ON "identity_role_mappings"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "identity_role_mappings_providerId_claim_externalValue_targe_key" ON "identity_role_mappings"("providerId", "claim", "externalValue", "targetRole");

-- CreateIndex
CREATE INDEX "federated_identities_userId_idx" ON "federated_identities"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "federated_identities_issuer_subject_key" ON "federated_identities"("issuer", "subject");

-- CreateIndex
CREATE UNIQUE INDEX "federated_identities_providerId_userId_key" ON "federated_identities"("providerId", "userId");

-- CreateIndex
CREATE INDEX "role_assignment_sources_tenantId_idx" ON "role_assignment_sources"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "role_assignment_sources_userId_roleKey_sourceKey_key" ON "role_assignment_sources"("userId", "roleKey", "sourceKey");

-- AddForeignKey
ALTER TABLE "identity_providers" ADD CONSTRAINT "identity_providers_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity_role_mappings" ADD CONSTRAINT "identity_role_mappings_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "identity_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "federated_identities" ADD CONSTRAINT "federated_identities_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "federated_identities" ADD CONSTRAINT "federated_identities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "federated_identities" ADD CONSTRAINT "federated_identities_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "identity_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_assignment_sources" ADD CONSTRAINT "role_assignment_sources_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_assignment_sources" ADD CONSTRAINT "role_assignment_sources_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "identity_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- An external value is evidence for a COMMUNITY role only. Administrative roles are assigned in the portal.
ALTER TABLE "identity_role_mappings" ADD CONSTRAINT "identity_role_mappings_community_role_only"
  CHECK ("targetRole" IN ('STUDENT', 'FACULTY', 'STAFF', 'ALUMNI'));
ALTER TABLE "role_assignment_sources" ADD CONSTRAINT "role_assignment_sources_known_source"
  CHECK ("source" IN ('EXISTING', 'MANUAL', 'SIS', 'IDP'));

-- Provenance of every role held today: recorded as EXISTING (held before provenance was tracked).
INSERT INTO "role_assignment_sources" ("id", "tenantId", "userId", "roleKey", "source", "sourceKey", "createdAt", "confirmedAt")
SELECT gen_random_uuid()::text, u."tenantId", ur."userId", r."key", 'EXISTING', 'EXISTING', ur."createdAt", CURRENT_TIMESTAMP
FROM "user_roles" ur
JOIN "roles" r ON r."id" = ur."roleId"
JOIN "users" u ON u."id" = ur."userId"
ON CONFLICT DO NOTHING;
