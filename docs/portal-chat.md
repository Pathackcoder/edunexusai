# Portal chat (one-to-one messaging)

Private one-to-one conversations between portal members. They are started from a **People Search** profile ("Chat") and reached from the **message icon** in the header, which shows the signed-in person's unread count.

## How it works

```
Browser ── REST /api/v1/chat/* ─────────────┐   same portal session token (requireAuth /
        └─ Socket.IO /socket.io (same port) ┴─► authenticateAccessToken), same CORS allow-list
                                                    │
                                    modules/chat/chatService.js ── Prisma ── PostgreSQL
```

- **Identity.** The socket handshake sends the portal access token, the same token every REST call uses.
  - For a Keycloak sign-in, that token is issued after the OIDC flow.
  - The server verifies it with the same function as `requireAuth`: signature, active account and tenant, and a live SSO session.
  - The account is checked again on every send.
  - The connection is closed when the token expires, and the client reconnects with a refreshed token.
  - The sender is always the authenticated account, never a value from the client.
- **Who can be messaged.** The active portal account that a People Search entry is linked to (`directory_profiles.userId`), in the same institution. It is never matched by name or email. Entries without a linked account show a disabled Chat button.
- **One conversation per pair.** `conversations.directKey` is the two user ids, sorted, and it is unique per tenant. Either person, even both at the same moment, opens the same conversation.
- **Delivery.**
  - A message is stored in PostgreSQL first. Only then is the sender's acknowledgement sent and the message delivered to both participants.
  - The client shows "Sending…" until then, and "Not sent · Retry" on failure.
  - Retries reuse the message's `clientId`, so a message is stored at most once.
  - Events are de-duplicated by id or `clientId`.
- **Rooms.** `user:<id>` is joined at connect, for the inbox and unread count. `conversation:<id>` is joined only after a participant check. Clients never name rooms.
- **Unread and read receipts.** Each participant has a `lastReadAt`, set from the newest message's database timestamp. Unread = messages from others after it. The sender sees ✓ (sent) and ✓✓ (seen).
- **Limits.**
  - At most 4000 characters per message, enforced in the API and by a database CHECK.
  - At most 20 messages per 10 seconds per account.
  - A 32 KB socket payload ceiling.
  - Message text is never written to logs.

## API

| | |
|---|---|
| `GET /chat/conversations` | Inbox: other participant, last message, unread count, plus `unreadTotal`. |
| `POST /chat/conversations` `{ profileId }` | Open or create the conversation with a People Search entry. |
| `GET /chat/conversations/:id/messages?before=<messageId>` | History, oldest first, 50 per page. |
| `POST /chat/conversations/:id/messages` `{ body, clientId? }` | Send (REST fallback; announced in real time too). |
| `POST /chat/conversations/:id/read` | Mark as read. |
| `GET /chat/unread` | `{ total, conversations }` |

Socket events:
- Client to server, each answered through an acknowledgement: `chat:join`, `chat:leave`, `chat:send`, `chat:read`.
- Server to client: `chat:message`, `chat:read`, `chat:unread`, `chat:session-expired`.

A conversation that isn't yours answers 404, exactly like one that doesn't exist.

## Database

Migration `20261029160000_portal_chat` is additive. It creates the `conversations`, `conversation_participants` and `chat_messages` tables and the enum `ConversationKind`, plus two CHECK constraints.
- `kind` (`DIRECT` today) and participant rows leave room for group conversations.
- Attachments would be a new table keyed by message.

```
cd backend
npx prisma migrate deploy   # test database first: DATABASE_URL="$TEST_DATABASE_URL" npx prisma migrate deploy
```

## Configuration and deployment

- **No new environment variables.** Socket.IO uses the backend's port and `CORS_ORIGINS`.
- **Development.** Vite proxies `/socket.io` (with WebSocket upgrade) to the API, like `/api`. When the frontend uses an absolute `VITE_API_BASE_URL`, the socket connects to that origin, which must be in `CORS_ORIGINS`.
- **Reverse proxy.** Forward `/socket.io/` to the API with WebSocket upgrade. For nginx:

  ```
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  ```

  Without it, Socket.IO falls back to long-polling and still works.
- **One API process.** Rooms and the send-rate counter live in memory. Running several API instances needs sticky sessions and a shared Socket.IO adapter (for example Redis or the Postgres adapter). That is not needed for the current single-process deployment.
- **Session tokens** are still kept in `localStorage`, as for the rest of the portal (see `services/api/client.js`).
