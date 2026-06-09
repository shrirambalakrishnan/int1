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

const eventSchemas = {
  BoardCreated,
  BoardUpdated,
  TaskCreated,
  TaskUpdated,
  CommentCreated,
  CommentUpdated,
};

module.exports = { eventSchemas };
