'use strict';

const { BoardEventsHandler } = require('./handlers/boardEventsHandler');

/**
 * Single entrypoint for the integration worker. Routes an event to the right
 * handler method based on its `type`. This is the seam a RabbitMQ consumer will
 * call later (receive message -> processEvent -> ack/nack); it imports no
 * transport, so the worker logic stays independent of how events arrive.
 *
 * Event shape: { type, boardId, integrationId, occurredAt }
 */
const boardEventsHandler = new BoardEventsHandler();

const routes = {
  BoardCreated: (event) => boardEventsHandler.onBoardCreated(event),
};

async function processEvent(event) {
  const route = routes[event.type];
  if (!route) {
    throw new Error(`No handler registered for event type: ${event.type}`);
  }
  return route(event);
}

module.exports = { processEvent };
