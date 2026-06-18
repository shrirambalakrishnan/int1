# Asana

[← back to README](../../README.md) · [Integrations overview](../../README.md#integrations)

Static-token provider (`Bearer`), outbound push + inbound webhook (per-project, batched).

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
  Stored in the Keychain as `ASANA_API_TOKEN` (see [Secrets](../../README.md#secrets)).
- **Setup**: the `asana` Integration row ships in a migration. `ASANA_WORKSPACE_ID`
  (non-secret) goes in `.env`. If the workspace is an *organization*, Asana also
  requires a team on project creation — set `ASANA_TEAM_ID`; personal workspaces
  don't need it.
- **Rate limit**: 150 requests/min on the free plan. On 429 the client waits for
  `Retry-After` (seconds) and retries once, then throws.
- **Deferred**: assignee/user mapping, status sync, reconciliation sweep.

Driving a sync by hand works like ClickUp, with `ASANA_API_TOKEN` exported instead.

## Asana webhooks (inbound)

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

- **Registration** (server must be up and tunneled first; see the [ClickUp doc](clickup.md)
  for tunnel options):

```bash
export ASANA_API_TOKEN=$(security find-generic-password -a "$USER" -s ASANA_API_TOKEN -w)
npm run webhook:asana:register -- https://<public-host>/webhooks/asana <projectGid>
```

  Then copy the secret from the server logs into the Keychain as
  `ASANA_WEBHOOK_SECRET` (the log prints the exact command) and export it before
  restarting `npm start`.
