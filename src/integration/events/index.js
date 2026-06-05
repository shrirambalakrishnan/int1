'use strict';

const Joi = require('joi');
const { eventSchemas } = require('./schemas');

/**
 * Builds an event of `type` from its payload, stamping the common envelope
 * fields, then validates the result against the shared schema. Throws if the
 * event is invalid — so a malformed event can never be published. Use this
 * everywhere events are produced (the script today, the controller later).
 */
function buildEvent(type, payload) {
  const schema = eventSchemas[type];
  if (!schema) {
    throw new Error(`Cannot build unknown event type: ${type}`);
  }
  const event = {
    type,
    occurredAt: new Date().toISOString(),
    payload,
  };
  return Joi.attempt(event, schema, `Invalid ${type} event:`, {
    abortEarly: false,
  });
}

/**
 * Validates a received event against the shared schema for its type and returns
 * the cleaned value. Throws at this boundary on any problem (missing/unknown
 * type, bad payload); the caller — the RabbitMQ consumer, later — decides
 * whether to nack/DLQ.
 */
function validateEvent(raw) {
  if (!raw || typeof raw.type !== 'string') {
    throw new Error('Event is missing a string `type`');
  }
  const schema = eventSchemas[raw.type];
  if (!schema) {
    throw new Error(`No schema for event type: ${raw.type}`);
  }
  return Joi.attempt(raw, schema, `Invalid ${raw.type} event:`, {
    abortEarly: false,
  });
}

module.exports = { buildEvent, validateEvent };
