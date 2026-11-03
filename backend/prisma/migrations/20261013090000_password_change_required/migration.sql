-- Additive: accounts given a temporary password by an administrator must choose their own
-- at first sign-in. Existing accounts default to false, so nobody is affected or locked out.
ALTER TABLE "users" ADD COLUMN "passwordChangeRequired" BOOLEAN NOT NULL DEFAULT false;
