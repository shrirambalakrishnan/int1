# int1

API-only service mirroring external integrations (Jira/Linear-style) into Postgres.
Express 5 + Sequelize 6. No UI, no auth yet. Architecture is in the code/README — this
file only captures what isn't obvious from reading the repo.

## Commands

```bash
npm start

# CLI reads paths from .sequelizerc. Source .env first: env doesn't persist across
# shells, and the DB name is built from it (DB name = ${DB_NAME}_${ENV}, e.g. int1_dev).
set -a; . ./.env; set +a
npx sequelize-cli db:migrate
```

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

## IntegrationUser is a unified "actor" table

One table for two actor kinds; created automatically on an integration call:
- **External** users: `integrationId` + `externalUserId` set, `loginUserId` null.
- **Internal admins** (`LoginUser`): `loginUserId` set, the other two null (admins have no
  external identity).

All three FK columns are nullable. Two unique indexes partition the space: composite
`(integrationId, externalUserId)`, and a **partial** unique on
`loginUserId WHERE loginUserId IS NOT NULL`.
