# Nexora (AI workspace)

Nexora is the conversational workspace at `/nexora` (header button, every persona). One backend module serves all
personas: `backend/src/modules/nexora`.

## How it fits together

| Piece | File | Role |
| --- | --- | --- |
| Routes | `nexoraRoutes.js` | `/api/v1/nexora`: session, conversations, streamed turns (SSE), action confirm/cancel |
| Orchestrator | `orchestrator.js` | builds the turn, dispatches tool calls, persists what the person saw |
| Provider | `providers/anthropicProvider.js` | Claude via `@anthropic-ai/sdk`, streaming manual tool loop behind `runTurn()` |
| Tools | `tools/*.js` | one registry; persona files declare tools that call existing services |
| Actions | `actionService.js` | PENDING → confirm/cancel → EXECUTED / FAILED / CANCELLED / EXPIRED |
| Storage | `nexora_conversations`, `nexora_messages`, `nexora_actions` | migration `20261112120000_nexora` |

Adding a provider: implement `runTurn()` (see the contract at the top of `anthropicProvider.js`) and register it in
`providers/index.js`. Nothing else changes.

## Security model

- Identity, roles and tenant come only from the authenticated session (`requireAuth`). No tool accepts a user,
  student, role or tenant id; tool schemas are strict, so an invented argument is rejected.
- The tool list for a turn is computed from the session (`denialReason`); a call to any other tool is refused and
  audited (`NEXORA_TOOL_DENIED`). Each tool calls the same service the matching portal screen uses, which enforces
  ownership again (CampusCore resolves the SIS identity from the session; rosters only for sections taught, etc.).
- Write tools never execute inside the model loop. `prepare()` creates a PENDING action; only the person's own
  `POST /nexora/actions/:id/confirm` runs `execute()`, after re-checking ownership, expiry and tool availability, with
  an atomic claim against double execution. Outcomes are audited (`NEXORA_ACTION_*`) and appended to the
  conversation as portal updates, so Nexora only reports what the service confirmed.
- Conversations are scoped by tenant and user on every query (another person's id is a 404).
- Stored: user text, Nexora's reply text, action cards and tool names/outcomes. Not stored: raw tool results,
  prompts sent to the provider, credentials. Earlier turns are replayed to the model as text only.

## Configuration (backend `.env`)

| Variable | Default | |
| --- | --- | --- |
| `CLAUDE_API_KEY` | — | required; never logged or returned |
| `NEXORA_MODEL` | `claude-opus-5-5` | single place the model is chosen |
| `NEXORA_EFFORT` | `medium` | low · medium · high · xhigh · max |
| `NEXORA_ENABLED` | on when a key is set | `false` switches Nexora off |
| `NEXORA_REFUSAL_FALLBACK` | `default` | server-side refusal fallback; `off` disables |
| `NEXORA_MAX_TOKENS`, `NEXORA_TIMEOUT_MS`, `NEXORA_MAX_RETRIES`, `NEXORA_MAX_TOOL_ROUNDS`, `NEXORA_HISTORY_MESSAGES`, `NEXORA_MAX_CONVERSATION_MESSAGES`, `NEXORA_ACTION_TTL_MINUTES`, `NEXORA_TURNS_PER_MINUTE` | see `config.js` | |

## Known gaps

- No assigned-advisor record exists (portal or CampusCore); advisors met before are flagged instead.
- Faculty class messages/announcements are delivered as portal notifications to the section's registered students
  with portal accounts (CampusCore announcements are read-only to the portal).
- No tool books meetings between colleagues (advising booking is student-only in the existing API).
- LMS inactivity needs Moodle to expose last-access times to the integration account (the current site does not).
- Department/program announcements depend on department/program values on portal profiles (empty locally).
- SSE through the Vercel rewrite is untested (local only).

Full technical manual (architecture, data access, database impact, troubleshooting, deployment): `docs/NEXORA_DOCUMENTATION.md`.
