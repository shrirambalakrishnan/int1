'use strict';

const Joi = require('joi');

/**
 * Single source of truth for integration event shapes. Each event is validated
 * against the schema here in BOTH directions: when built for publishing
 * (buildEvent) and when received for processing (validateEvent) — see ./index.js.
 *
 * Envelope shape: { type, occurredAt, payload: { ...event-specific... } }
 * - type/occurredAt are common metadata on every event.
 * - integrationId lives in the payload (every integration event targets one).
 *
 * Add a new event = add one entry to `eventSchemas`.
 */

// Common envelope fields shared by every event; per-event schemas pin `type`
// and define their own `payload`.
const envelope = {
  type: Joi.string().required(),
  occurredAt: Joi.string().isoDate().required(),
};

const BoardCreated = Joi.object({
  ...envelope,
  type: Joi.string().valid('BoardCreated').required(),
  payload: Joi.object({
    integrationId: Joi.number().integer().required(),
    boardId: Joi.number().integer().required(),
  }).required(),
});

const BoardUpdated = Joi.object({
  ...envelope,
  type: Joi.string().valid('BoardUpdated').required(),
  payload: Joi.object({
    integrationId: Joi.number().integer().required(),
    boardId: Joi.number().integer().required(),
  }).required(),
});

const TaskCreated = Joi.object({
  ...envelope,
  type: Joi.string().valid('TaskCreated').required(),
  payload: Joi.object({
    integrationId: Joi.number().integer().required(),
    taskId: Joi.number().integer().required(),
    // title is NOT NULL on Task; description is nullable.
    title: Joi.string().required(),
    description: Joi.string().allow(null),
  }).required(),
});

const TaskUpdated = Joi.object({
  ...envelope,
  type: Joi.string().valid('TaskUpdated').required(),
  payload: Joi.object({
    integrationId: Joi.number().integer().required(),
    taskId: Joi.number().integer().required(),
    title: Joi.string().required(),
    description: Joi.string().allow(null),
  }).required(),
});

const CommentCreated = Joi.object({
  ...envelope,
  type: Joi.string().valid('CommentCreated').required(),
  payload: Joi.object({
    integrationId: Joi.number().integer().required(),
    commentId: Joi.number().integer().required(),
    // content is NOT NULL on Comment.
    content: Joi.string().required(),
  }).required(),
});

const CommentUpdated = Joi.object({
  ...envelope,
  type: Joi.string().valid('CommentUpdated').required(),
  payload: Joi.object({
    integrationId: Joi.number().integer().required(),
    commentId: Joi.number().integer().required(),
    content: Joi.string().required(),
  }).required(),
});

// ---------------------------------------------------------------------------
// Inbound (External*) events — built by a provider webhook translator after it
// verified and enriched the delivery, consumed by the External*EventsHandlers
// that write canonical rows. Payloads therefore carry *external* ids plus the
// already-fetched data; the inbound handlers never call a provider API.

// The user who performed the action in the external system; null when the
// provider didn't say. externalUserId keys IntegrationUser findOrCreate.
const actor = Joi.object({
  externalUserId: Joi.string().required(),
  username: Joi.string().allow(null),
  email: Joi.string().allow(null),
}).allow(null);

const ExternalBoardCreated = Joi.object({
  ...envelope,
  type: Joi.string().valid('ExternalBoardCreated').required(),
  payload: Joi.object({
    integrationId: Joi.number().integer().required(),
    externalBoardId: Joi.string().required(),
    // name is NOT NULL on Board.
    name: Joi.string().required(),
    actor: actor.required(),
  }).required(),
});

const ExternalBoardUpdated = Joi.object({
  ...envelope,
  type: Joi.string().valid('ExternalBoardUpdated').required(),
  payload: Joi.object({
    integrationId: Joi.number().integer().required(),
    externalBoardId: Joi.string().required(),
    name: Joi.string().required(),
    actor: actor.required(),
  }).required(),
});

const ExternalTaskCreated = Joi.object({
  ...envelope,
  type: Joi.string().valid('ExternalTaskCreated').required(),
  payload: Joi.object({
    integrationId: Joi.number().integer().required(),
    // Where the task lives remotely — resolves the parent Board locally.
    externalBoardId: Joi.string().required(),
    externalTaskId: Joi.string().required(),
    title: Joi.string().required(),
    description: Joi.string().allow(null),
    actor: actor.required(),
  }).required(),
});

const ExternalTaskUpdated = Joi.object({
  ...envelope,
  type: Joi.string().valid('ExternalTaskUpdated').required(),
  payload: Joi.object({
    integrationId: Joi.number().integer().required(),
    externalTaskId: Joi.string().required(),
    title: Joi.string().required(),
    description: Joi.string().allow(null),
    actor: actor.required(),
  }).required(),
});

const ExternalCommentCreated = Joi.object({
  ...envelope,
  type: Joi.string().valid('ExternalCommentCreated').required(),
  payload: Joi.object({
    integrationId: Joi.number().integer().required(),
    // Where the comment lives remotely — resolves the parent Task locally.
    externalTaskId: Joi.string().required(),
    externalCommentId: Joi.string().required(),
    content: Joi.string().required(),
    actor: actor.required(),
  }).required(),
});

const ExternalCommentUpdated = Joi.object({
  ...envelope,
  type: Joi.string().valid('ExternalCommentUpdated').required(),
  payload: Joi.object({
    integrationId: Joi.number().integer().required(),
    externalCommentId: Joi.string().required(),
    content: Joi.string().required(),
    actor: actor.required(),
  }).required(),
});

const eventSchemas = {
  BoardCreated,
  BoardUpdated,
  TaskCreated,
  TaskUpdated,
  CommentCreated,
  CommentUpdated,
  ExternalBoardCreated,
  ExternalBoardUpdated,
  ExternalTaskCreated,
  ExternalTaskUpdated,
  ExternalCommentCreated,
  ExternalCommentUpdated,
};

module.exports = { eventSchemas };
