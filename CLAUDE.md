# int1

API-only service mirroring external integrations (Jira/Linear-style) into Postgres.
Express 5 + Sequelize 6. No UI, no auth yet. First real provider is ClickUp (outbound
push, all six events); everything else resolves to a stub client. Architecture is in
the code/README — this file only captures what isn't obvious from reading the repo.

## Commands

```bash
npm start

# CLI reads paths from .sequelizerc. Source .env first: env doesn't persist across
# shells, and the DB name is built from it (DB name = ${DB_NAME}_${ENV}, e.g. int1_dev).
set -a; . ./.env; set +a
npx sequelize-cli db:migrate

# Anything that talks to ClickUp also needs the token exported (see Secrets):
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

- **Guard semantics in handlers — two kinds, don't mix them up.** "Nothing to do"
  (missing entity, already integrated, Update before Create) → skip + warn. "Can't do it
  *yet*" (Created event whose parent isn't integrated) → **throw**: loud today, becomes
  broker redelivery later. Converting a throw to a skip silently loses the sync.
- **Clients are DB-free.** Handlers load parents and pass them in (`createTask(task, board)`,
  `createComment(comment, task)`). Same principle in auth: strategies never read
  `process.env`; callers pass the token in.
- **External ids are opaque strings — never `parseInt`.** ClickUp task ids are alphanumeric
  (`86d3a4z65`); list/comment ids exceed 32-bit (`901615344323`).
- **`selectIntegration` falls back to the stub for unknown names.** Convenient in dev, but a
  missing Integration row "succeeds" with fake external ids. That's why the `clickup` row is
  reference data shipped in a migration (`ON CONFLICT DO NOTHING`; `down` is a deliberate
  no-op — deleting would cascade to Boards).
- **Deliberately NOT extracted yet (rule of three — wait for the second real provider):**
  `request()` stays inside clickupClient because its error shape (`{err, ECODE}`) and
  rate-limit headers are provider-specific. The 429 sleep-and-retry-once is scaffolding —
  when a broker fronts the worker it should be deleted (throw → nack → delayed redelivery),
  with a client-side throttle below 100 req/min and a cron reconciler on top
  (`integrationUpdatedAt` + null-external-id columns are designed for that sweep).
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
