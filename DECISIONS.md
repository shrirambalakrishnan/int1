# Decisions

Append-only log of significant design decisions. Newest first. Keep each entry
brief (Context / Decision / Consequences). Don't edit past entries — to change a
decision, add a new dated entry that supersedes the old one.

## 2026-06-24 — Outbound worker: manual ack + broker-native dead-letter queue

**Context:** The outbound worker consumed with `{ noAck: true }`, so a thrown
`processEvent` (unknown type, schema failure, or a "can't do it *yet*" handler guard) was
auto-acked and silently lost. Issue #44 needs those failures to survive somewhere durable
so they can be triaged. Two ways to get them there: let the broker dead-letter on `nack`,
or catch in the consumer and `publish` a copy to a DLQ ourselves.

**Decision:** Broker-native dead-lettering. The worker switches to manual ack with
`prefetch(1)`: `ack` on success, `nack(requeue:false)` on a throw. `int1worker.queue`
carries `x-dead-letter-exchange: events.dlx` (a durable fanout) bound to a durable
`int1worker.dlq`, so the broker routes rejected messages there with `x-death` metadata
(count, reason, original routing key). Straight to the DLQ on the first failure — no
retry/backoff yet. The exception text is `console.error`-logged before nacking because
`x-death` does not carry it.

**Consequences:** Failures accumulate in `int1worker.dlq` instead of vanishing, and the
`nack` path is the seam the inbound 500-as-retry and the request core's 429 retry collapse
into later. Queue arguments are immutable, so an existing `int1worker.queue` must be
deleted once (`rabbitmqctl delete_queue int1worker.queue`) before startup can recreate it
with the DLX arg. Trade-offs: a poison message dead-letters on the first failure (no
retry), and the captured failure context is only the original event plus logs — a future
DLQ-triage consumer re-derives "why" from live DB/provider state. Retry/backoff (e.g. a
TTL retry queue dead-lettering back to the main queue) and publisher confirms remain
follow-ups.

## 2026-06-12 — Inbound webhooks reuse the event seam; provider retry is the redelivery

**Context:** First inbound sync (ClickUp webhooks → canonical models). The outbound
flow already has an event seam (`processEvent`), shared schemas, and guard semantics;
inbound could either reuse them or grow a parallel pipeline.

**Decision:** Webhook deliveries are translated into canonical `External*` events
(`ExternalBoardCreated`, ...) that flow through the same `processEvent` seam and
schema validation as outbound. The translator
(`integration/inbound/clickupWebhookTranslator.js`) is the only provider-specific
piece: it verifies nothing (the controller checked the HMAC over the raw body
already), fetches the full entity because ClickUp payloads are thin, and builds the
event; the `External*` handlers are provider-agnostic and only write canonical rows.
Guard semantics mirror outbound, inverted: already-mirrored external id → skip (this
doubles as echo suppression of our own outbound pushes); update for an unmirrored
entity → skip; created event whose parent isn't mirrored yet → throw → HTTP 500 →
ClickUp redelivers. The provider's webhook retry plays the broker-redelivery role
today, so the receiver processes inline and acks with the outcome rather than
queueing.

**Consequences:** No second pipeline; a future Asana/Trello inbound is one new
translator plus a registration script. Trade-offs: processing inline ties webhook
latency to our handler time (fine at this scale; the broker plan covers async later);
a parent-ordering throw depends on ClickUp actually retrying; the echo race (webhook
arriving before the outbound handler persists the external id) can duplicate a row —
loud via unique index, reconciler sweep is the eventual fix.

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
