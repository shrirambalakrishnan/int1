# Trello

[← back to README](../../README.md) · [Integrations overview](../../README.md#integrations)

Key + token provider (OAuth 1.0a header shape, no signing), outbound push + inbound
webhook (board-level).

| int1 entity  | Trello resource                                         |
|--------------|---------------------------------------------------------|
| Integration  | one Board (pinned by `TRELLO_BOARD_ID`)                 |
| Board        | List, created on that Board                             |
| Task         | Card, created in the board's List                       |
| Comment      | Comment on the card (a `commentCard` Action)            |
| User         | Board member (mapping deferred)                         |

Cards can only live in Lists, never directly on a Board — so int1 Boards map a level
below Trello's Board, same reasoning as ClickUp's Space and Asana's Workspace.

- **API**: v1, `https://api.trello.com/1`. Endpoints used:
  `POST /lists`, `PUT /lists/{id}`, `POST /cards`, `PUT /cards/{id}`,
  `POST /cards/{id}/actions/comments`, `PUT /actions/{id}/text`; inbound adds
  `GET /lists/{id}`, `GET /cards/{id}`, `GET /actions/{id}`, `POST /webhooks`.
  Error bodies are often plain text (`invalid key`), only sometimes JSON
  (`{ message }`).
- **Auth**: API key (identifies the app) + user token, both in a single header via the
  `token` strategy with `scheme: 'OAuth'`:
  `Authorization: OAuth oauth_consumer_key="…", oauth_token="…"` — no signing, the
  scheme just borrows OAuth 1.0's header shape. The header form (not Trello's
  `?key=…&token=…` query alternative) keeps credentials out of request paths, which
  appear in error messages and logs. Stored in the Keychain as `TRELLO_API_KEY` and
  `TRELLO_API_TOKEN` (see [Secrets](../../README.md#secrets)). Get the key from an app at
  [trello.com/power-ups/admin](https://trello.com/power-ups/admin) (API Key tab);
  generate the token via the "Token" link next to the key — real tokens start with
  `ATTA`.
- **Setup**: the `trello` Integration row ships in a migration. `TRELLO_BOARD_ID`
  (non-secret) goes in `.env` — use the canonical 24-char id, not the 8-char
  shortLink from the board URL.
- **Rate limit**: 100 requests per 10 seconds per token (300 per key). The 429 carries
  no retry header, so the client sleeps one full 10s window, retries once, then throws.
- **Deferred**: assignee/user mapping, status sync, reconciliation sweep.

Driving a sync by hand works like ClickUp, with both `TRELLO_API_KEY` and
`TRELLO_API_TOKEN` exported instead.

## Trello webhooks (inbound)

Same seam as ClickUp/Asana — raw-body verification in the controller, a
provider-aware translator (`src/integration/inbound/trelloWebhookTranslator.js`),
the shared `External*` handlers — with four protocol differences:

1. **Different signature.** Trello signs `X-Trello-Webhook` = base64 HMAC-**SHA1**
   over the raw body with the **callback URL appended**, keyed by the Trello
   **app secret** (`TRELLO_API_SECRET`) — not the SHA256/hex/body-only scheme
   ClickUp and Asana share, so it has its own verifier. Because the callback URL
   is part of the signed bytes, the receiver must know its exact registered URL:
   set `TRELLO_WEBHOOK_CALLBACK_URL` in `.env` (reconstructing it from the request
   is unreliable behind a tunnel that rewrites `Host`). Bad signature → 401.
2. **HEAD handshake, pre-shared secret.** At registration Trello sends a `HEAD` to
   the callback URL and creates the webhook only if it returns 200 — no body, no
   secret to echo (the secret is the app secret you already hold). So, like Asana,
   the server must be up and publicly reachable *before* you register.
3. **No event filter.** Trello can't subscribe to a subset of actions — the
   webhook fires on *every* action on the board, so the translator's action-type
   map is the only filter and unhandled actions (acked with 200) are the common
   case, not the exception.
4. **One board-level webhook.** It's registered on the Trello Board
   (`TRELLO_BOARD_ID`), so — unlike Asana's per-project scope — it observes
   `createList` and Trello *does* deliver `ExternalBoardCreated`.

| Trello action | Canonical event | Effect |
|---|---|---|
| `createList` / `updateList` | `ExternalBoardCreated/Updated` | create / rename Board |
| `createCard` / `updateCard` | `ExternalTaskCreated/Updated` | create / edit Task |
| `commentCard` / `updateComment` | `ExternalCommentCreated/Updated` | create / edit Comment |

Each delivery is one `{ model, action }` (no batching). Trello payloads carry the
changed entity inline, but the translator still fetches the full entity
(`GET /lists/{id}`, `GET /cards/{id}`, `GET /actions/{id}`) so mirrored rows are
complete (a `createCard` omits the desc; an `updateCard` carries only the changed
fields). The actor comes straight from the action's `memberCreator` (id +
username; Trello exposes no email). Idempotency, echo suppression, and the
throw-on-unmirrored-parent → 500 → Trello-retry behavior are identical to the
[ClickUp doc](clickup.md).

- **Registration** (server must be up and tunneled first — Trello HEADs the
  callback URL; see the [ClickUp doc](clickup.md) for tunnel options):

```bash
set -a; . ./.env; set +a
export TRELLO_API_KEY=$(security find-generic-password -a "$USER" -s TRELLO_API_KEY -w)
export TRELLO_API_TOKEN=$(security find-generic-password -a "$USER" -s TRELLO_API_TOKEN -w)
npm run webhook:trello:register -- https://<public-host>/webhooks/trello
```

  Then set `TRELLO_WEBHOOK_CALLBACK_URL` in `.env` to that exact URL, store the
  Trello app secret in the Keychain as `TRELLO_API_SECRET` (from
  [trello.com/power-ups/admin](https://trello.com/power-ups/admin)), and export it
  before restarting `npm start`.
