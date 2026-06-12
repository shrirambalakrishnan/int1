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

1. An event (`BoardCreated`, `TaskUpdated`, ...) enters `processEvent()`
   (`src/integration/eventProcessor.js`). Today the `npm run emit:*` scripts drive this
   directly; a message broker (RabbitMQ) will replace them as the trigger.
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
token); OAuth can be added later without touching clients' call sites.

Guard behavior in handlers:

| Situation                                        | Behavior                                  |
|--------------------------------------------------|-------------------------------------------|
| Entity already integrated (Created redelivered)  | Skip — idempotent, retry-safe              |
| Update event for a never-integrated entity       | Skip — creation is the Created event's job |
| Created event but parent not integrated yet      | **Throw** — loud now, broker redelivery later |

External ids (`integrationBoardId`, `integrationTaskId`, `integrationCommentId`,
`externalUserId`) are **opaque strings** — providers use alphanumeric and >32-bit ids.

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
- **Deferred**: assignee/user mapping, status sync, inbound sync (webhooks),
  reconciliation sweep.

Driving a sync by hand works the same as ClickUp, with `ASANA_API_TOKEN` exported
instead.

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
  `POST /cards/{id}/actions/comments`, `PUT /actions/{id}/text`. Error bodies are
  often plain text (`invalid key`), only sometimes JSON (`{ message }`).
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
- **Deferred**: assignee/user mapping, status sync, inbound sync (webhooks),
  reconciliation sweep.

Driving a sync by hand works the same as ClickUp, with both `TRELLO_API_KEY` and
`TRELLO_API_TOKEN` exported instead.

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
