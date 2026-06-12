'use strict';

const { BoardEventsHandler } = require('./handlers/boardEventsHandler');
const { TaskEventsHandler } = require('./handlers/taskEventsHandler');
const { CommentEventsHandler } = require('./handlers/commentEventsHandler');
const {
  ExternalBoardEventsHandler,
} = require('./handlers/externalBoardEventsHandler');
const {
  ExternalTaskEventsHandler,
} = require('./handlers/externalTaskEventsHandler');
const {
  ExternalCommentEventsHandler,
} = require('./handlers/externalCommentEventsHandler');
const { validateEvent } = require('./events');

/**
 * Single entrypoint for the integration worker. Validates the incoming event
 * against its schema (the receive-side boundary), then routes it to the right
 * handler based on `type`. This is the seam a RabbitMQ consumer will call later
 * (receive message -> processEvent -> ack/nack); it imports no transport, so the
 * worker logic stays independent of how events arrive.
 *
 * Event shape: { type, occurredAt, payload: { ... } }
 */
const boardEventsHandler = new BoardEventsHandler();
const taskEventsHandler = new TaskEventsHandler();
const commentEventsHandler = new CommentEventsHandler();
const externalBoardEventsHandler = new ExternalBoardEventsHandler();
const externalTaskEventsHandler = new ExternalTaskEventsHandler();
const externalCommentEventsHandler = new ExternalCommentEventsHandler();

const routes = {
  BoardCreated: (event) => boardEventsHandler.onBoardCreated(event),
  BoardUpdated: (event) => boardEventsHandler.onBoardUpdated(event),
  TaskCreated: (event) => taskEventsHandler.onTaskCreated(event),
  TaskUpdated: (event) => taskEventsHandler.onTaskUpdated(event),
  CommentCreated: (event) => commentEventsHandler.onCommentCreated(event),
  CommentUpdated: (event) => commentEventsHandler.onCommentUpdated(event),
  // Inbound: changes that happened in the external system, delivered by a
  // provider webhook and translated to canonical External* events.
  ExternalBoardCreated: (event) =>
    externalBoardEventsHandler.onExternalBoardCreated(event),
  ExternalBoardUpdated: (event) =>
    externalBoardEventsHandler.onExternalBoardUpdated(event),
  ExternalTaskCreated: (event) =>
    externalTaskEventsHandler.onExternalTaskCreated(event),
  ExternalTaskUpdated: (event) =>
    externalTaskEventsHandler.onExternalTaskUpdated(event),
  ExternalCommentCreated: (event) =>
    externalCommentEventsHandler.onExternalCommentCreated(event),
  ExternalCommentUpdated: (event) =>
    externalCommentEventsHandler.onExternalCommentUpdated(event),
};

async function processEvent(rawEvent) {
  const event = validateEvent(rawEvent);
  const route = routes[event.type];
  if (!route) {
    throw new Error(`No handler registered for event type: ${event.type}`);
  }
  return route(event);
}

module.exports = { processEvent };
