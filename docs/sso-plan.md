# Single sign-on plan: EduNexusAI, CampusCore SIS and Moodle

**Status:** plan only. Nothing here is implemented yet. Password sign-in stays in place in every system until SSO is configured and verified.

## What exists today (inspected 2026-10-13)

| System | Sign-in | Identifier | Notes |
|---|---|---|---|
| EduNexusAI | Email and password (bcrypt). JWT access token plus rotating refresh token. | `users.id`; email is unique per tenant | Temporary passwords must be changed at first sign-in. |
| CampusCore SIS | Email and password (scrypt). HttpOnly session cookie plus CSRF. | `User.email` (unique). Student and faculty records carry student or employee numbers. | The integration API uses OAuth 2 client credentials; that is not a user login. |
| Moodle 5.3 (MoodleCloud) | Manual accounts | Username and ID number, set to the CampusCore institutional ID by onboarding | No OAuth 2 issuers are configured. Mobile web services are enabled. |

The systems already share a stable person key: the **CampusCore institutional ID** and the **institutional email**. The CampusCore ↔ EduNexusAI identity link and the EduNexusAI ↔ Moodle link already exist.

## Options considered

1. **EduNexusAI becomes the identity provider** (an OIDC provider built into the portal).
   - Rejected for now. It turns the portal into security-critical identity infrastructure, which is a large auth rewrite.
   - It makes CampusCore depend on EduNexusAI.
   - MoodleCloud would need EduNexusAI on a public HTTPS address.
2. **Self-hosted Keycloak (OIDC).**
   - Free and standard, and runs locally in Docker.
   - MoodleCloud's server must reach the identity provider's token endpoint, so Keycloak needs a public HTTPS address (a tunnel in development, a host in production). That is extra moving parts for this team.
3. **A managed OIDC provider, such as Microsoft Entra ID, Google Workspace or Auth0.** Recommended.
   - Already on the public internet, so MoodleCloud can use it directly.
   - Local EduNexusAI and CampusCore can be clients with `http://localhost` redirect URIs in development, because the browser carries the redirect and the servers call out to the provider.
   - If the institution already uses Microsoft 365 or Google Workspace, use that tenant. Otherwise a free developer tenant of a managed provider is the simplest start.

**Protocol:** OpenID Connect for all three. Moodle's core *OAuth 2* authentication supports OIDC issuers. SAML is not needed.

## Target architecture

```
                 ┌──────────────── Identity provider (OIDC) ────────────────┐
                 │ users: institutional email (verified) + claim             │
                 │        institutional_id = CampusCore student/employee no. │
                 └───────▲──────────────────▲──────────────────▲────────────┘
     OIDC code flow      │                  │                  │  OAuth 2 issuer
                  EduNexusAI         CampusCore SIS            Moodle
                  (client)           (client)                  (client, auth_oauth2)
```

- **Authorisation does not move.** Each application still decides roles and access itself:
  - EduNexusAI: roles plus the CampusCore and Moodle links;
  - CampusCore: user roles and records;
  - Moodle: course roles.

  The identity provider only proves who the person is.
- **Matching on first SSO sign-in:**
  - **First choice:** a stored subject link (`issuer` + `sub`) on the account.
  - **Otherwise:** link an existing account only if the email is verified by the provider **and** matches exactly one active account **and** the `institutional_id` claim matches the CampusCore record linked to that account.
  - **Anything else** is refused, with "contact the administrator". Never match by name.
- **Logout:**
  - Each application ends its own session.
  - EduNexusAI and CampusCore also call the provider's end-session endpoint (RP-initiated logout).
  - Moodle's OAuth 2 plugin does not do single logout, so a Moodle session can outlive a portal logout until Moodle's session timeout.
- **Lifecycle:**
  - Disabling the person at the provider stops new sign-ins everywhere.
  - EduNexusAI also revokes refresh tokens when an account is suspended (already implemented).
  - CampusCore deactivation and Moodle suspension remain the authoritative account states.

## Step-by-step setup

**Phase 1: identity provider (configuration, outside the codebases)**

1. Choose the tenant: the institution's Entra ID or Google Workspace, or a managed developer tenant.
2. Create users with the institutional email, verified, plus a custom claim `institutional_id`. A one-off import can come from CampusCore's student and faculty directory, a CSV of email and institutional ID.
3. Register three OIDC applications:

   | Application | Redirect URI | Post-logout URI |
   |---|---|---|
   | EduNexusAI | `http://localhost:5173/auth/callback` (dev), `https://portal.feddrick.edu/auth/callback` (prod) | the login page |
   | CampusCore | `http://localhost:5180/auth/callback` (dev), production URL later | the login page |
   | Moodle | `https://my-feddrick-university.moodlecloud.com/admin/oauth2callback.php` | — |

   Store the client secrets only in each backend's secret store.

**Phase 2: Moodle (configuration in Moodle, by a Moodle administrator)**

1. *Site administration → Server → OAuth 2 services → Create new custom service*:
   - issuer URL (the provider's base);
   - client ID and secret;
   - *Login domains* = the institutional email domains;
   - *Require email verification* decided by policy (on is safer for the first rollout).
   - Check that the discovery endpoints resolve.
2. *User field mappings*: `email → email`, `given_name → firstname`, `family_name → lastname`, and `institutional_id → idnumber` if the provider emits it.
3. *Plugins → Authentication → Manage authentication*: enable **OAuth 2**.
4. **Existing manual accounts.**
   - On first SSO sign-in with the same verified email, Moodle offers to link the login (a confirmation email if verification is required).
   - Alternatively, switch accounts to `auth = oauth2` in bulk after linking.
   - Keep manual sign-in for the site administrator.
5. Confirm on MoodleCloud that the plan allows custom OAuth 2 issuers. If it allows only the built-in Google and Microsoft templates, use one of those providers.

**Phase 3: EduNexusAI (code; additive; behind `SSO_ENABLED`)**

1. Add an OIDC client (`openid-client`), using authorisation code + PKCE, with state and nonce.
2. Routes:
   - `GET /auth/oidc/start` redirects to the provider;
   - `GET /auth/oidc/callback` validates the ID token, matches the account (rules above), then issues the **existing** JWT session, reusing the current session code.
3. Additive storage of the subject: `external_identities` rows with a new provider value `OIDC` (`internalId` = user id, `externalId` = issuer + sub), or a small `user_federated_identities` table.
4. Login page: "Sign in with Feddrick ID", with password sign-in kept until SSO is verified. Then password sign-in becomes admin-only.
5. Onboarding: keep creating the login with a temporary password until SSO is live. Afterwards create it without a password, linked at first SSO sign-in.

**Phase 4: CampusCore (code; additive; behind a flag)**

Do the same as EduNexusAI for its `/api/app` login: OIDC code flow, then CampusCore's existing session cookie. Store the subject on `User` (additive column).

**Phase 5: tests and rollout**

1. **Development:** a test tenant with a few users, created from fictional CampusCore records.
2. **Automated:** contract tests with a mocked OIDC provider. Cover the matching rules: verified email + ID claim, an unverified email refused, ambiguous matches refused, and a refused token replay.
3. **Manual end to end:**
   1. Sign in to EduNexusAI with SSO.
   2. Open *Submit in Moodle* from an assignment: Moodle opens without a second sign-in.
   3. Open CampusCore: signed in.
   4. Log out of EduNexusAI: the provider session ends.
4. **Production prerequisites:**
   - HTTPS host names for EduNexusAI and CampusCore;
   - registered production redirect URIs;
   - secrets in a secrets manager;
   - clock sync (ID-token expiry);
   - a decision on Moodle email verification;
   - support process for unmatched accounts.

## What SSO changes for the Moodle workflows

- **Submissions:** students submit in Moodle through the existing deep links, without a second password. This is the supported way to "submit through the portal" with MoodleCloud.
- **Moodle passwords:** the separate Moodle password and the one-time password handover are no longer needed for SSO users.
- **Unchanged:** CampusCore stays the academic record, Moodle the LMS record, and EduNexusAI the experience layer.
