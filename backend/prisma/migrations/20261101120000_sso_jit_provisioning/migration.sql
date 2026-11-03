-- SSO-first account creation (JIT): a per-provider switch (off by default) and accounts without a portal password.
-- Additive: one new column with a default, one relaxed constraint; no existing row changes.
-- Rollback: ALTER TABLE "identity_providers" DROP COLUMN "jitProvisioning";
--           (only once no row has a NULL password) ALTER TABLE "users" ALTER COLUMN "passwordHash" SET NOT NULL;
ALTER TABLE "identity_providers" ADD COLUMN "jitProvisioning" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ALTER COLUMN "passwordHash" DROP NOT NULL;
