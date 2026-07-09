# int1

API-only service mirroring external integrations (Jira/Linear-style) into Postgres.
Express 5 + Sequelize 6. No UI, no auth yet. Real providers are ClickUp, Asana,
Trello and Basecamp (all four do outbound push, all six events; ClickUp, Asana and
Trello also have inbound webhooks — Basecamp is outbound-only so far);
everything else resolves to a stub client.
Architecture is in the code/README — this file only captures what isn't obvious from
reading the repo.

**Docs are part of every feature.** When a feature lands, update the docs in the same
change, and update this file if a decision or gotcha changed. Don't wait to be asked.
The README is the portfolio-facing overview (architecture diagrams, engineering
highlights, capability matrix, auth, secrets, scope/trade-offs) — keep it scannable; a
**new provider gets its own `docs/providers/<name>.md`** for the deep reference (resource
mapping, endpoints, webhook signature scheme, rate limits, registration), plus a row in
the README capability matrix and a row in the README secrets table.

## Commands

```bash
npm start

# CLI reads paths from .sequelizerc. Source .env first: env doesn't persist across
# shells, and the DB name is built from it (DB name = ${DB_NAME}_${ENV}, e.g. int1_dev).
set -a; . ./.env; set +a
npx sequelize-cli db:migrate

# Anything that talks to a provider also needs its secret(s) exported (see Secrets) —
# CLICKUP_API_TOKEN, ASANA_API_TOKEN, or TRELLO_API_KEY + TRELLO_API_TOKEN:
export CLICKUP_API_TOKEN=$(security find-generic-password -a "$USER" -s "CLICKUP_API_TOKEN" -w)
npm run emit:board:created -- <boardId> <integrationId>   # drive the worker end-to-end
```

## Secrets — macOS Keychain, never .env

Secrets (API tokens, credentials) never go in `.env` or any file — `.env` holds only
non-secret config (hosts, IDs). Secrets live in the macOS Keychain; the Keychain
service name equals the env var name:

```bash
# store once (-U updates if it exists); prompts for the value so it stays out of shell history
security add-generic-password -U -a "$USER" -s "CLICKUP_API_TOKEN" -w

# read — inline in commands or export before npm start
export CLICKUP_API_TOKEN=$(security find-generic-password -a "$USER" -s "CLICKUP_API_TOKEN" -w)
```

Always suggest this pattern when a new secret/token is introduced. Full detail in
README "Secrets" section.

## Decisions & gotchas

- **Migrations are progressive — never fold a change back into a `create-*` migration.**
  Each schema change is its own new migration (tables first, then a separate
  `add-foreign-keys`, then nullability/index tweaks), even though nothing is deployed.
  The readable progression is the point.
- `createTable` **silently ignores** inline `indexes`/`references` — that's why indexes use
  a separate `addIndex` and FKs use separate `addConstraint` migrations with explicit names.
- **Cascade deletes are enforced in both layers on purpose:** association
  `hasMany(..., { onDelete: 'CASCADE', hooks: true })` (JS) **and** DB FK `ON DELETE CASCADE`.
  Use `instance.destroy()` so hooks fire — bulk `Model.destroy({ where })` bypasses JS hooks
  (DB FK still cleans up).
- Errors: each controller try/catches and calls `sendError` (`src/utils/errors.js`); the
  central handler in `app.js` is only JSON-parse + 500 fallback. Not central middleware.
- Routing is hybrid, max one level of nesting (`/boards/:boardId/tasks`,
  `/tasks/:taskId/comments`); other resources are top-level.

## Integration layer decisions

- **Outbound events go through RabbitMQ (2026-06, issue #26 — outbound only).** API
  controllers `publish()` the built event after the DB write to the topic exchange
  `events.exchange` (routing key per type, e.g. `boards.created`); the worker
  (`src/worker.js`, `npm run start:worker`) consumes `int1worker.queue` and calls
  `processEvent`. All broker wiring is in `src/rabbitMQ.js`, and topology is asserted
  idempotently at startup by both processes (start order doesn't matter) — including the
  dead-letter pair (`events.dlx` fanout → `int1worker.dlq`). **The worker manual-acks
  (2026-06, issue #44):** on success it `ack`s; a thrown handler `nack`s (requeue:false)
  so the broker dead-letters the message to `int1worker.dlq` instead of dropping it
  (`prefetch(1)` bounds unacked work; the exception text is logged before nacking because
  `x-death` doesn't carry it). Publish-after-commit still isn't transactional, and
  retry/backoff, publisher confirms, and a DLQ-triage consumer remain tracked follow-ups —
  the publish/commit gap leans on the reconciliation sweep (`integrationUpdatedAt` +
  null-external-id).
  **Inbound webhooks still call `processEvent` inline** (the 500-as-retry below is
  unchanged) — putting them on the broker is a separate ticket.
- **Guard semantics in handlers — two kinds, don't mix them up.** "Nothing to do"
  (missing entity, already integrated, Update before Create) → skip + warn. "Can't do it
  *yet*" (Created event whose parent isn't integrated) → **throw**: today the worker nacks
  it to `int1worker.dlq` (retry/redelivery later). Converting a throw to a skip silently
  loses the sync.
- **Clients are DB-free.** Handlers load parents and pass them in (`createTask(task, board)`,
  `createComment(comment, task)`). Same principle in auth: strategies never read
  `process.env`; callers pass the token in.
- **External ids are opaque strings — never `parseInt`.** ClickUp task ids are alphanumeric
  (`86d3a4z65`); list/comment ids exceed 32-bit (`901615344323`).
- **`selectIntegration` falls back to the stub for unknown names.** Convenient in dev, but a
  missing Integration row "succeeds" with fake external ids. That's why the `clickup` row is
  reference data shipped in a migration (`ON CONFLICT DO NOTHING`; `down` is a deliberate
  no-op — deleting would cascade to Boards).
- **`request()` is extracted (2026-06): generalize the skeleton, never the quirks.**
  `clients/request.js` exports `createRequest({name, baseUrl, authStrategy, retryDelayMs,
  errorMessage, wrapBody?, unwrapResponse?})` — the core owns fetch + read-body-as-text-
  then-try-JSON + 429-retry-once (wait clamped 1s–60s). Quirks stay in each client as
  hooks: ClickUp errors `{err, ECODE}`, retry from `X-RateLimit-Reset`; Asana `{data}`
  envelope both ways, errors `{errors: [...]}`, retry from `Retry-After`; Trello errors
  often **plain text** and its 429 has **no retry header** (fixed 10s window). Do NOT
  generalize further: the six mapping functions ARE the quirks (config-driven only works
  for data variance, not behavior variance). **Hook-creep guardrails:** the core is
  opt-in — the client contract is only the six methods (stubClient has no `request()` at
  all). A new provider may add at most ONE new hook, and only optional + defaulted to
  current behavior so existing clients and their tests are untouched. Hard cap: the
  descriptor stays ≤ 8 keys total (**now 8 — at the cap**: Basecamp's issue-#38 client
  spent the last slot on `defaultHeaders`, the static per-request headers its required
  `User-Agent` needs). A provider needing more than one new hook, or breaching the cap,
  writes its own private `request()` instead — never bend the core around one weird API;
  ten providers each adding "just one hook" is how a helper becomes a framework. The 429 sleep-and-retry-once is scaffolding —
  when a broker fronts the worker delete it from the core (throw → nack → delayed
  redelivery), with a client-side throttle below the provider limit and a cron reconciler
  on top (`integrationUpdatedAt` + null-external-id columns are designed for that sweep).
- **No workflow engine — deliberate, with a defined trigger to revisit (decided 2026-06).**
  Multi-step syncs (e.g. ensure-user-then-create-board) do NOT need an engine: each step's
  completion persists as domain state (`externalUserId`, `integrationBoardId`, ...) with an
  idempotent already-done guard, so ordering and resume-from-checkpoint fall out of
  guards + redelivery (choreography, not orchestration). **Recommend switching to a
  workflow engine the moment a proposed feature needs orchestration state with no domain
  home:** fan-out/fan-in joins ("237 of 500 backfilled tasks done"), compensation/undo
  across steps, timers or waiting-on-human states, or dynamic step graphs. Backfill/import
  of an existing external board is the expected first trigger — if such a feature comes up,
  raise this decision proactively before designing it on guards alone.
- **Inbound webhooks (ClickUp + Asana + Trello, 2026-06): same event seam, inverted guards.**
  Webhook deliveries become canonical `External*` events through the one `processEvent`
  seam. The split: the controller (`controllers/webhook.js`) owns signature
  verification over the **raw body** (so `/webhooks` mounts before `express.json()`
  and uses `express.raw`; the exact scheme is per-provider — see deltas) — the
  translator (`integration/inbound/`) is the only provider-aware piece (fetches the
  full entity: ClickUp/Asana payloads are thin, Trello's are fat but fetched anyway
  for complete rows), and the `External*` handlers only write canonical rows. Skip/throw
  semantics mirror outbound: known external id → skip (this IS the echo suppression
  for our own outbound pushes — don't add a separate mechanism);
  created-event-with-unmirrored-parent → throw → 500 → the provider's webhook retry
  is the redelivery. `processEvent` is awaited inline in the controller —
  scaffolding, like the 429 sleep-and-retry: when RabbitMQ lands, switch the
  receiver to verify → translate → publish → ack, and let the consumer call
  `processEvent` (nack replaces the 500-as-retry). The client read methods and
  exported `request` on clickupClient/asanaClient/trelloClient are inbound/tooling extras — the
  cross-provider contract via `selectIntegration` is still only the six outbound
  methods. **Asana deltas:** the secret arrives via a registration-time handshake
  (receiver echoes `X-Hook-Secret` and logs it — the server must be up and tunneled
  *before* `npm run webhook:asana:register`); deliveries are **batches**
  (`{events: [...]}`, empty array = heartbeat → 200) processed sequentially, where
  the first throw 500s the batch and the known-external-id skip makes redelivery
  idempotent; the webhook is **per project** (workspace webhooks can't carry
  task/story events), so `ExternalBoardCreated` never arrives from Asana and each
  synced board needs its own registration; only `comment_added`-subtype stories
  translate (everything else is a system story, filtered without an API call).
  **Trello deltas:** the signature diverges enough to get its own verifier (not the
  shared one) — base64 HMAC-**SHA1** over the raw body with the registered **callback
  URL appended**, keyed by the pre-shared app secret (`TRELLO_API_SECRET`); the
  callback URL is therefore config (`TRELLO_WEBHOOK_CALLBACK_URL`), not derived from
  the request (a tunnel rewrites `Host`). The registration handshake is a bare `HEAD`
  → 200 (no secret to echo — Trello's secret is pre-shared, not handed back). Trello
  has **no event filter**, so the translator's action-type map is the sole filter and
  unhandled actions are the norm; each delivery is a single `{model, action}` (no
  batch). Payloads are fat (the action carries the changed entity + `memberCreator`),
  but the translator still fetches the entity for completeness while reading the actor
  straight from the payload. The webhook is **board-level** (one, on `TRELLO_BOARD_ID`),
  so unlike Asana `ExternalBoardCreated` *does* arrive (from `createList`).
- **OAuth2 arrives with Basecamp (issue #27 auth + token storage, issue #38 outbound sync — single-tenant first).**
  Basecamp 4 is the first OAuth2 provider, picked because it is OAuth2-*only* (the forcing
  function the `token` strategy never gave; ClickUp/Asana also offer static tokens, Trello
  is OAuth 1.0a). It offers **only the authorization-code grant** (no client-credentials),
  and its OAuth2 is **draft 5**: non-standard `type=web_server` param on the authorize/token
  URLs, **no PKCE, no discovery**, 2-week access tokens + refresh (refresh token is **not**
  rotated). PKCE is moot — int1 is a confidential server-side client. Shape:
  `/oauth/basecamp/{connect,callback}` run redirect → consent → code-exchange (verify a
  `state` for CSRF); the `oauth2` strategy (`auth/oauth2AuthStrategy.js`) refreshes
  proactively on expiry behind the same async `getAuthHeaders()` seam (reactive 401-refresh
  is a follow-up — the request core only retries 429 today). **Clients/strategies stay
  DB-free** — the strategy is handed the current tokens plus `refresh`/`persist` closures,
  and a *caller* loads the token + builds those closures (so a mid-call refresh is saved).
  **That caller is `resolveBasecampClient` at the `selectIntegration` seam, not the handler**
  (issue #38, "Option A"): Basecamp's client is **connection-bound** (account-scoped base
  URL `https://3.basecampapi.com/{accountId}` + per-user DB token), so it can't be a static
  singleton in the `selectIntegration` registry — `selectIntegration` special-cases
  `basecamp` and builds the client per call. This keeps handlers and the six-method contract
  provider-agnostic (pushing the token-load into the handler would make every handler
  OAuth-aware). **Single-tenant first, but store the token against the connecting
  `IntegrationUser` keyed by `externalUserId` (the Basecamp identity), never as a global
  blob** — then multi-tenant is additive (more rows: `resolveBasecampClient` throws on >1
  connection today rather than guessing an actor). **Resource mapping** mirrors ClickUp:
  pinned Project (`BASECAMP_PROJECT_ID`) → to-do set (resolved from the project dock, or
  pinned via `BASECAMP_TODOSET_ID`) → Board=to-do list → Task=to-do → Comment=comment.
  Quirk: Basecamp's **PUT clears omitted fields**, so `updateTask` always resends
  `content`+`description` (unlike ClickUp/Asana partial PUT). Config: `BASECAMP_CLIENT_ID` +
  `BASECAMP_REDIRECT_URI` + `BASECAMP_PROJECT_ID` in `.env`, `BASECAMP_CLIENT_SECRET` in
  Keychain; the per-connection tokens (access/refresh/expiry/account id) are domain state in
  the DB, not config — see "Config homes" below.
- **Config homes — there is no config.json.** Provider constants (BASE_URL) live in the
  client; per-environment values in `.env`; secrets in Keychain; future per-instance
  settings belong on the Integration row (e.g. a `settings` JSONB), not in a file.
- `getAuthHeaders()` is async on purpose: the interface must fit OAuth refresh later.

## IntegrationUser is a unified "actor" table

One table for two actor kinds; created automatically on an integration call:
- **External** users: `integrationId` + `externalUserId` set, `loginUserId` null.
- **Internal admins** (`LoginUser`): `loginUserId` set, the other two null (admins have no
  external identity).

All three FK columns are nullable. Two unique indexes partition the space: composite
`(integrationId, externalUserId)`, and a **partial** unique on
`loginUserId WHERE loginUserId IS NOT NULL`.
