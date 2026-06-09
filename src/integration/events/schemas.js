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

const eventSchemas = {
  BoardCreated,
  BoardUpdated,
};

module.exports = { eventSchemas };
