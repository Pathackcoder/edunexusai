-- View-As: the named permission users.view_as may be granted (widens the existing list; analytics.view is unchanged).
ALTER TABLE "user_permissions" DROP CONSTRAINT "user_permissions_permission_check";
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_permission_check" CHECK ("permission" IN ('analytics.view', 'users.view_as'));

-- A View-As session shows one student or faculty portal, read-only, to an administrator other than the subject.
ALTER TABLE "view_as_sessions" ADD CONSTRAINT "view_as_sessions_persona_check" CHECK ("persona" IN ('STUDENT', 'FACULTY'));
ALTER TABLE "view_as_sessions" ADD CONSTRAINT "view_as_sessions_mode_check" CHECK ("mode" = 'READ_ONLY');
ALTER TABLE "view_as_sessions" ADD CONSTRAINT "view_as_sessions_not_self_check" CHECK ("actorUserId" <> "subjectUserId");
ALTER TABLE "view_as_sessions" ADD CONSTRAINT "view_as_sessions_expiry_check" CHECK ("expiresAt" > "createdAt");
ALTER TABLE "view_as_sessions" ADD CONSTRAINT "view_as_sessions_counts_check" CHECK ("requestCount" >= 0 AND "blockedCount" >= 0);
