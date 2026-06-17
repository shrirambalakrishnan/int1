# int1

## What is int1?

A unified aggregator for Project Management Tools

## Problem Statement
- Different teams within a company can use different Project Management tools based on their requirements
  - This affect visibility of overall tasks for the management
  - We need a way to look at all the projects across all the team at a single place
- The above use case invariably leads to the need for taking action from aggregator whenever user needs
  - We need a way to sync data aggregator to the project management tool

## Entities

- These are int1's entities. 
- Each integration maps its own terminology onto this schema as part of its integration plan.

| Entity   | Description                                                        |
|----------|--------------------------------------------------------------------|
| User     | A member of a board. Used for login and as a task assignee.        |
| Board    | A collection of tasks, typically owned by one team.                |
| Task     | A unit of work on a board, assignable to a User.                   |
| Comment  | An update added to a Task by a User.                               |

### Planned for future

| Entity     | Description                              |
|------------|------------------------------------------|
| Subtask    | A child task nested under a parent task  |
| Attachment | One or more documents added to a comment |

## Integrations

How a local change reaches the external tool:

1. An event (`BoardCreated`, `TaskUpdated`, ...) reaches `processEvent()`
   (`src/integration/eventProcessor.js`). For outbound changes the API controllers
   publish the event to RabbitMQ and a separate worker consumes it and calls
   `processEvent` (see [Message broker (RabbitMQ)](#message-broker-rabbitmq) below).
   The `npm run emit:*` scripts still call `processEvent` directly as a broker-free way
   to drive a single event by hand, and inbound webhooks still invoke it inline (moving
   those onto the broker is a separate ticket).
2. The matching handler (`src/integration/handlers/`) loads the entity, applies guards,
   and resolves a client through `selectIntegration` — a registry keyed by the
   `Integration` row's name. Unregistered names fall back to a **stub client** that
   simulates a provider with synthetic ids.
3. The client (`src/integration/clients/`) maps int1's uniform interface —
   `createBoard`, `updateBoard`, `createTask`, `updateTask`, `createComment`,
   `updateComment` — onto the provider's REST API. Clients never touch the database:
   handlers load parent entities and pass them in (`createTask(task, board)`,
   `createComment(comment, task)`). All real clients share one HTTP core
   (`clients/request.js`: fetch + JSON + 429-retry-once), configured per provider
   with small hooks for the parts that genuinely differ — error shape, retry
   delay, body envelope. Only those hooks and the six mapping functions are
   provider-specific.

Authentication is pluggable per provider via strategies (`src/integration/auth/`),
resolved through `selectAuthStrategy`. The first strategy is `token` (static API
token); a second, `oauth2` (Basecamp), refreshes an expiring bearer token behind the
same async `getAuthHeaders()` seam without touching clients' call sites.

Guard behavior in handlers:

| Situation                                        | Behavior                                  |
|--------------------------------------------------|-------------------------------------------|
| Entity already integrated (Created redelivered)  | Skip — idempotent, retry-safe              |
| Update event for a never-integrated entity       | Skip — creation is the Created event's job |
| Created event but parent not integrated yet      | **Throw** — loud now, broker redelivery later |

External ids (`integrationBoardId`, `integrationTaskId`, `integrationCommentId`,
`externalUserId`) are **opaque strings** — providers use alphanumeric and >32-bit ids.

### Message broker (RabbitMQ)

Outbound events are decoupled from processing by a broker: the API publishes, a
separate worker process consumes. All wiring lives in `src/rabbitMQ.js` (connection
and channel, topology declaration, `publish`, `consume`).

- **Producer** — the resource controllers (`src/controllers/board|task|comment.js`)
  build the event after the DB write and `publish()` it to the **topic** exchange
  `events.exchange`, with a routing key per type (`boards.created`, `tasks.updated`,
  `comments.created`, ...).
- **Queue & binding** — one durable queue `int1worker.queue`, bound to the exchange
  for all six routing keys.
- **Consumer** — the worker (`src/worker.js`, `npm run start:worker`) consumes the
  queue and hands each message to `processEvent`.
- **Topology** is asserted idempotently at startup, so both `npm start` and
  `npm run start:worker` declare the exchange/queue/bindings on boot — order of
  startup doesn't matter.
- **Config**: `RABBITMQ_URL` is non-secret and lives in `.env`
  (e.g. `amqp://localhost:5672`).

Running the full outbound flow locally (two shells):

```bash
set -a; . ./.env; set +a
export CLICKUP_API_TOKEN=$(security find-generic-password -a "$USER" -s CLICKUP_API_TOKEN -w)
npm start             # API — publishes events on create/update
npm run start:worker  # worker — consumes int1worker.queue -> processEvent
```

This is **Phase 1: the outbound happy path, on purpose**. Known follow-ups:

- The consumer auto-acks (`noAck`), so a handler throw **drops** the message — no
  ack/nack, retry/backoff, or dead-letter queue yet.
- Publish happens after the DB commit and isn't transactional, so a broker outage can
  leave a persisted row whose event never published; the planned `integrationUpdatedAt`
  + null-external-id reconciliation sweep is the safety net.

### ClickUp

| int1 entity  | ClickUp resource                                       |
|--------------|--------------------------------------------------------|
| Integration  | Workspace + one Space (pinned by `CLICKUP_SPACE_ID`)   |
| Board        | List, created folderless in that Space                 |
| Task         | Task, created in the board's List (default status)     |
| Comment      | Comment on the task                                    |
| User         | Workspace member (mapping deferred)                    |

- **API**: v2, `https://api.clickup.com/api/v2`. Endpoints used:
  `POST /space/{id}/list`, `PUT /list/{id}`, `POST /list/{id}/task`, `PUT /task/{id}`,
  `POST /task/{id}/comment`, `PUT /comment/{id}`.
- **Auth**: personal API token (`pk_…`) via the `token` strategy, sent bare in the
  `Authorization` header (no `Bearer` prefix). Stored in the Keychain as
  `CLICKUP_API_TOKEN` (see Secrets below).
- **Setup**: the `clickup` Integration row ships in a migration, so every environment
  has it after `db:migrate`. Only `CLICKUP_SPACE_ID` (non-secret) goes in `.env`.
- **Rate limit**: 100 requests/min on the free plan. On 429 the client waits for
  `X-RateLimit-Reset` and retries once, then throws.
- **Deferred**: assignee/user mapping, status sync, deletes (both directions),
  reconciliation sweep.

Driving a sync by hand:

```bash
set -a; . ./.env; set +a
export CLICKUP_API_TOKEN=$(security find-generic-password -a "$USER" -s CLICKUP_API_TOKEN -w)
npm run emit:board:created -- <boardId> <integrationId>
```

#### ClickUp webhooks (inbound)

Changes made *in* ClickUp flow back through a webhook:

1. ClickUp POSTs to `/webhooks/clickup`. The route parses the **raw** body
   (`express.raw`, mounted before the app-wide `express.json`) because the
   `X-Signature` header is an HMAC-SHA256 over the exact bytes, keyed by the
   webhook's secret. Bad signature → 401.
2. The translator (`src/integration/inbound/clickupWebhookTranslator.js`) maps the
   delivery to a canonical `External*` event. ClickUp payloads are thin, so it
   fetches the full entity first (`GET /list/{id}`, `GET /task/{id}`,
   `GET /task/{id}/comment`). Unhandled event types are acked with 200 and ignored.
3. `processEvent()` routes it to an inbound handler
   (`src/integration/handlers/external*EventsHandler.js`) that writes the canonical
   row — the mirror image of the outbound flow, with the same guard semantics:

| ClickUp event | Canonical event | Effect |
|---|---|---|
| `listCreated` / `listUpdated` | `ExternalBoardCreated/Updated` | create / rename Board |
| `taskCreated` / `taskUpdated` | `ExternalTaskCreated/Updated` | create / edit Task |
| `taskCommentPosted` / `taskCommentUpdated` | `ExternalCommentCreated/Updated` | create / edit Comment |

- **Idempotency & echo suppression**: a Created event for an external id we already
  mirror is skipped — this also absorbs the webhook ClickUp fires back when *we*
  pushed the change outbound. An Updated event for something we never mirrored is
  skipped (creation is the Created event's job). A Created event whose **parent**
  isn't mirrored yet throws → 500 → ClickUp retries the delivery, which is exactly
  the broker-redelivery role; by the retry the parent's event has usually landed.
- **Actor attribution**: the acting ClickUp user (from `history_items`) is
  `findOrCreate`d as an external `IntegrationUser` and set as
  `createdByIntegrationUserId` on created rows.
- **Registration** (needs `CLICKUP_TEAM_ID` — the workspace id — and
  `CLICKUP_SPACE_ID` in `.env`; the webhook is scoped to that Space):

```bash
set -a; . ./.env; set +a
export CLICKUP_API_TOKEN=$(security find-generic-password -a "$USER" -s CLICKUP_API_TOKEN -w)
npm run webhook:clickup:register -- https://<public-host>/webhooks/clickup
```

  The script prints the webhook id and secret; store the secret in the Keychain as
  `CLICKUP_WEBHOOK_SECRET` (the script prints the exact command) and export it
  before `npm start`. For local dev ClickUp needs a public URL — put a tunnel
  (e.g. `ngrok http 3000` or `cloudflared tunnel --url http://localhost:3000`) in
  front and register the tunnel URL.
- **Synchronous for now**: the receiver awaits `processEvent()` inline, so webhook
  latency includes our handler time and a handler throw surfaces as the 500 that
  triggers ClickUp's retry. When RabbitMQ lands, the receiver should verify,
  translate, **publish, and ack immediately**; the consumer then calls
  `processEvent` and a nack/delayed-redelivery replaces the 500-as-retry.
- **Known limitations**: `Task.title` is unique, so an inbound task whose title
  collides with an existing one fails (500; ClickUp's retries will keep failing —
  rename one side). And in a tight race, ClickUp's echo of our own outbound push can
  arrive before the outbound handler persists the external id, creating a duplicate
  row; the outbound update then fails loudly on the unique index. The planned
  reconciliation sweep is the eventual fix.

### Asana

| int1 entity  | Asana resource                                          |
|--------------|---------------------------------------------------------|
| Integration  | Workspace (pinned by `ASANA_WORKSPACE_ID`)              |
| Board        | Project, created in that Workspace                      |
| Task         | Task, attached to the board's Project via `projects`    |
| Comment      | Story (type `comment`) on the task                      |
| User         | Workspace member (mapping deferred)                     |

- **API**: 1.0, `https://app.asana.com/api/1.0`. Endpoints used:
  `POST /projects`, `PUT /projects/{gid}`, `POST /tasks`, `PUT /tasks/{gid}`,
  `POST /tasks/{gid}/stories`, `PUT /stories/{gid}`. Request and response bodies
  are wrapped in a `{ data }` envelope; errors arrive as `{ errors: [...] }`.
- **Auth**: Personal Access Token via the `token` strategy with `scheme: 'Bearer'`.
  Stored in the Keychain as `ASANA_API_TOKEN` (see Secrets below).
- **Setup**: the `asana` Integration row ships in a migration. `ASANA_WORKSPACE_ID`
  (non-secret) goes in `.env`. If the workspace is an *organization*, Asana also
  requires a team on project creation — set `ASANA_TEAM_ID`; personal workspaces
  don't need it.
- **Rate limit**: 150 requests/min on the free plan. On 429 the client waits for
  `Retry-After` (seconds) and retries once, then throws.
- **Deferred**: assignee/user mapping, status sync, reconciliation sweep.

Driving a sync by hand works the same as ClickUp, with `ASANA_API_TOKEN` exported
instead.

#### Asana webhooks (inbound)

Same seam as ClickUp — raw-body verification in the controller, a provider-aware
translator (`src/integration/inbound/asanaWebhookTranslator.js`), the shared
`External*` handlers — with three protocol differences:

1. **Handshake, not API-returned secret.** The secret isn't in the registration
   response: during `POST /webhooks` Asana POSTs an `X-Hook-Secret` header to the
   receiver, which must echo it back with 200. The receiver logs the secret with
   the Keychain commands — so the server must already be running and publicly
   reachable when you register, and the secret comes out of the **server logs**.
   Deliveries are then signed `X-Hook-Signature` = HMAC-SHA256 over the raw body,
   keyed by that secret (`ASANA_WEBHOOK_SECRET`).
2. **Batched deliveries.** A delivery is `{ events: [...] }` (possibly many), and
   an empty `events` array is a heartbeat (sent at handshake and every 8 hours) —
   acked with 200. Events are processed sequentially; the first throw 500s the
   delivery and Asana redelivers the batch with exponential backoff (up to 24h,
   then it deletes the webhook). Already-applied events skip via the
   known-external-id guard, so partial-batch redelivery is idempotent.
3. **Per-project scope.** Workspace webhooks can't carry task/story events, so the
   webhook is registered on one Project (a Board's `integrationBoardId`) — one
   registration per synced board. Consequence: there is no inbound
   `ExternalBoardCreated` from Asana (a project webhook can't observe its own
   project's creation).

| Asana event (resource : action) | Canonical event | Effect |
|---|---|---|
| `project : changed` | `ExternalBoardUpdated` | rename Board |
| `task : added` / `task : changed` | `ExternalTaskCreated/Updated` | create / edit Task |
| `story(comment_added) : added` / `: changed` | `ExternalCommentCreated/Updated` | create / edit Comment |

Events are compact (`{ user, resource, action, parent }`), so the translator
fetches the full entity first (`GET /projects/{gid}`, `GET /tasks/{gid}`,
`GET /stories/{gid}`). Non-comment stories ("X added the task to Y") are filtered
by `resource_subtype` without an API call; deletes/`removed`/`undeleted` are
ignored. The actor carries only the Asana user gid (compact events have no
name/email).

- **Registration** (server must be up and tunneled first; see the ClickUp section
  for tunnel options):

```bash
export ASANA_API_TOKEN=$(security find-generic-password -a "$USER" -s ASANA_API_TOKEN -w)
npm run webhook:asana:register -- https://<public-host>/webhooks/asana <projectGid>
```

  Then copy the secret from the server logs into the Keychain as
  `ASANA_WEBHOOK_SECRET` (the log prints the exact command) and export it before
  restarting `npm start`.

### Trello

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
  `TRELLO_API_TOKEN` (see Secrets below). Get the key from an app at
  [trello.com/power-ups/admin](https://trello.com/power-ups/admin) (API Key tab);
  generate the token via the "Token" link next to the key — real tokens start with
  `ATTA`.
- **Setup**: the `trello` Integration row ships in a migration. `TRELLO_BOARD_ID`
  (non-secret) goes in `.env` — use the canonical 24-char id, not the 8-char
  shortLink from the board URL.
- **Rate limit**: 100 requests per 10 seconds per token (300 per key). The 429 carries
  no retry header, so the client sleeps one full 10s window, retries once, then throws.
- **Deferred**: assignee/user mapping, status sync, reconciliation sweep.

Driving a sync by hand works the same as ClickUp, with both `TRELLO_API_KEY` and
`TRELLO_API_TOKEN` exported instead.

#### Trello webhooks (inbound)

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
ClickUp section.

- **Registration** (server must be up and tunneled first — Trello HEADs the
  callback URL; see the ClickUp section for tunnel options):

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

### Basecamp (OAuth2)

Basecamp 4 (the BC3 API) is the first provider authenticated with **OAuth2** instead of
a static token — chosen precisely because it is **OAuth2-only** (Basic auth was removed),
so it forces the OAuth path the `token` strategy never exercised. The `/oauth/basecamp/*`
routes and token storage landed under issue #27; the `oauth2` strategy and the outbound
client (Board/Task/Comment push) landed under issue #38.

**Resource mapping** (parallels ClickUp's Space → List → Task → Comment): a pinned
**Project** (`BASECAMP_PROJECT_ID`) is the workspace int1 syncs into, and within its
**to-do set** (one per project, resolved from the project's dock — or pinned via
`BASECAMP_TODOSET_ID` to skip the lookup):

| int1    | Basecamp 4   | Endpoint (account-scoped base `https://3.basecampapi.com/{accountId}`) |
|---------|--------------|------------------------------------------------------------------------|
| Board   | to-do list   | `POST /todosets/{todosetId}/todolists.json`, `PUT /todolists/{id}.json` |
| Task    | to-do        | `POST /todolists/{boardId}/todos.json`, `PUT /todos/{id}.json`          |
| Comment | comment      | `POST /recordings/{taskId}/comments.json`, `PUT /comments/{id}.json`    |

Two Basecamp quirks the client absorbs: every request needs a **`User-Agent`** header
(missing → 400; carried via `request.js`'s `defaultHeaders` hook), and Basecamp's **PUT
clears any field it isn't sent** — so `updateTask` always resends both `content` and
`description`, unlike ClickUp/Asana's partial PUT. The base URL is account-scoped and the
token is per-connection, so the Basecamp client is **built per call** by
`resolveBasecampClient` (which loads the stored token and wires the `oauth2` strategy),
not registered as a shared singleton like the other clients.

- **Auth**: OAuth2 **authorization-code** flow — the only grant Basecamp offers (there is
  no client-credentials / app-only option, so a human consents at least once). Register an
  app at [launchpad.37signals.com/integrations](https://launchpad.37signals.com/integrations)
  to get a **Client ID** and **Client Secret**, with the redirect URI pointing at the
  callback route. Basecamp predates the final spec (OAuth2 **draft 5**): the authorize and
  token URLs take a non-standard `type=web_server` param, there is **no PKCE** and **no
  discovery document**, and access tokens **expire after 2 weeks** with a refresh token to
  renew them. PKCE isn't needed here — int1 is a confidential server-side client, so the
  client secret (kept server-side) is the protection PKCE would otherwise provide.
- **Config homes**:
  - `BASECAMP_CLIENT_ID` — non-secret → `.env`
  - `BASECAMP_REDIRECT_URI` — non-secret → `.env`
    (e.g. `http://localhost:3000/oauth/basecamp/callback`; the OAuth redirect is
    **browser-driven**, so localhost works without a tunnel — unlike the webhooks above)
  - `BASECAMP_PROJECT_ID` — non-secret → `.env` (the project int1 syncs into; like
    `CLICKUP_SPACE_ID`). Optional `BASECAMP_TODOSET_ID` skips the one-time dock lookup.
  - `BASECAMP_CLIENT_SECRET` — secret → **Keychain** (see Secrets below)
- **Tokens are not config.** The per-connection access token, refresh token, expiry, and
  Basecamp account id are **domain state**, stored in the database against the connecting
  `IntegrationUser` — single-tenant first (one connected actor), keyed per-actor so growing
  to multi-tenant is additive (more rows) rather than a re-home.

Driving a sync by hand (after connecting once via `/oauth/basecamp/connect`) works the
same as the other providers — the `oauth2` strategy reads the stored token, so only the
non-secret `.env` config and `BASECAMP_CLIENT_SECRET` (for token refresh) need to be set:

```bash
export BASECAMP_CLIENT_SECRET=$(security find-generic-password -a "$USER" -s BASECAMP_CLIENT_SECRET -w)
npm run emit:board:created -- <boardId> <integrationId>
```

## Secrets

Secrets (API tokens, passwords, keys) are **never stored in `.env` or any file in the
repo** — even though `.env` is gitignored, plaintext secrets on disk leak through
backups, editor history, and accidental un-ignoring. `.env` holds only non-secret
config (DB host, ClickUp space id, etc.).

Secrets live in the **macOS Keychain**, managed with the built-in `security` CLI.

### Conventions

- One Keychain item per secret, stored as a *generic password*.
- The **service name (`-s`) is exactly the env var name** the code expects
  (e.g. `CLICKUP_API_TOKEN`), so the mapping is self-documenting.
- The account (`-a`) is always `$USER`.

### Commands

```bash
# Store a secret (run once). -w with no value prompts interactively,
# keeping the secret out of shell history. -U overwrites an existing item.
security add-generic-password -U -a "$USER" -s "CLICKUP_API_TOKEN" -w

# Read it back
security find-generic-password -a "$USER" -s "CLICKUP_API_TOKEN" -w

# Delete it
security delete-generic-password -a "$USER" -s "CLICKUP_API_TOKEN"
```

### Using a secret

Inline in one-off commands:

```bash
curl -s -H "Authorization: $(security find-generic-password -a "$USER" -s CLICKUP_API_TOKEN -w)" \
  https://api.clickup.com/api/v2/user
```

Or export into the shell before starting the app, alongside sourcing `.env`:

```bash
set -a; . ./.env; set +a
export CLICKUP_API_TOKEN=$(security find-generic-password -a "$USER" -s CLICKUP_API_TOKEN -w)
npm start
```

The app reads secrets from `process.env` as usual — it neither knows nor cares that
the value came from the Keychain.

### Current secrets

| Keychain service / env var | Purpose                          |
|----------------------------|----------------------------------|
| `CLICKUP_API_TOKEN`        | ClickUp personal API token (`pk_…`) for the ClickUp integration |
| `ASANA_API_TOKEN`          | Asana Personal Access Token for the Asana integration |
| `TRELLO_API_KEY`           | Trello API key (identifies the app) for the Trello integration |
| `TRELLO_API_TOKEN`         | Trello user token (`ATTA…`) for the Trello integration |
| `CLICKUP_WEBHOOK_SECRET`   | HMAC secret for verifying inbound ClickUp webhooks (printed by `npm run webhook:clickup:register`) |
| `ASANA_WEBHOOK_SECRET`     | HMAC secret for verifying inbound Asana webhooks (delivered via handshake — printed in the server logs during `npm run webhook:asana:register`) |
| `TRELLO_API_SECRET`        | Trello app secret (OAuth secret) for verifying inbound Trello webhooks (`X-Trello-Webhook`); pre-existing app credential from [trello.com/power-ups/admin](https://trello.com/power-ups/admin), *not* printed by a register script |
| `BASECAMP_CLIENT_SECRET`   | Basecamp 4 OAuth2 client secret for the Basecamp integration's authorization-code flow; app credential from [launchpad.37signals.com/integrations](https://launchpad.37signals.com/integrations) (`BASECAMP_CLIENT_ID` and `BASECAMP_REDIRECT_URI` are non-secret → `.env`) |
