# Decisions

Append-only log of significant design decisions. Newest first. Keep each entry
brief (Context / Decision / Consequences). Don't edit past entries — to change a
decision, add a new dated entry that supersedes the old one.

## 2026-06-05 — Validate events against one shared schema at both boundaries

**Context:** Events flow producer → worker; a malformed payload could be emitted or
received, and per-side copies of the rules would drift.

**Decision:** One schema per event type is the single source of truth, used both to
build events (producer) and validate them (consumer) — not separate per-side rules.
Invalid events throw at the worker's entry boundary rather than returning an error
result (the consumer will nack/DLQ). Domain data is nested under `payload`.

**Consequences:** Bad events are caught at both edges with identical rules; adding an
event is one schema entry. Trade-offs: the consumer boundary must handle thrown errors
(DLQ, later); schema validation stays separate from DB constraints.

## 2026-06-05 — Integration worker: transport-agnostic, simple integrationId selection

**Context:** Starting the outbound integration flow (local change → external system),
decoupled from CRUD from day one. We want the worker logic testable and triggerable by
something other than RabbitMQ later.

**Decision:** The worker core is transport-agnostic — a single `processEvent(event)`
seam routes events to per-aggregate handler classes (`BoardEventsHandler`, etc.); no
broker imports. Provider selection is a single `selectIntegration(integrationId)` function (a
plain mapping for now, not a registry — deferred until duplication is felt; migrating
later changes only that function's body). First slice is `BoardCreated` end-to-end with
a stub client, driven by `scripts/emitBoardCreated.js`. Idempotency via the existing
`integrationBoardId IS NULL` check + unique index.

**Consequences:** Worker is unit-testable and runnable without infra; RabbitMQ becomes a
thin adapter (receive → dispatch → ack/nack) later. Trade-offs: no transport/retry yet;
Task/Comment handlers will need the parent-must-be-integrated-first ordering; real
provider clients still to come. Revisit selection shape if/when provider logic spreads.

## 2026-06-05 — Defer transactional outbox for integration events

**Context:** Pushing local changes outward (e.g. `BoardCreated` → broker / external
API) is a dual write — commit-then-publish can drop an event silently (drift between
our mirror and the external system), and publish-then-commit can emit phantom events
for rolled-back transactions. The transactional outbox pattern fixes this fully but
adds a table + relay we don't need at current scale (pre-scale, single service).

**Decision:** Publish events *after* commit (eliminates phantom events). Treat
`Board.integrationBoardId IS NULL` as the "needs integration" marker and add a
periodic reconciliation sweep so dropped events self-heal. Keep publishing behind a
single emit seam so it can become an outbox insert later without touching controllers.

**Consequences:** ~90% of the outbox's safety with no new infra, plus a clean upgrade
path. Trade-offs: no strict event ordering (acceptable — events are idempotent /
version-stamped via `integrationUpdatedAt`); delete propagation stays awkward (deleting
the Board row loses the marker, compounded by cascade deletes); reconciliation latency
on a failed publish. Revisit when ordering, reliable delete propagation, multiple
destinations, or throughput demand a real outbox.
