# ClickUp

[← back to README](../../README.md) · [Integrations overview](../../README.md#integrations)

Static-token provider, outbound push + inbound webhook (space-scoped).

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
  `CLICKUP_API_TOKEN` (see [Secrets](../../README.md#secrets)).
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

## ClickUp webhooks (inbound)

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
