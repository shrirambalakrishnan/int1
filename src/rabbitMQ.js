'use strict';

const amqp = require('amqplib');

// RabbitMQ config
//////// init setup ////////
// exchange
const RABBITMQ_EVENTS_EXCHANGE = 'events.exchange';
// routing keys
const RABBITMQ_ROUTING_KEY_BOARD_CREATED = 'boards.created';
const RABBITMQ_ROUTING_KEY_BOARD_UPDATED = 'boards.updated';
const RABBITMQ_ROUTING_KEY_TASK_CREATED = 'tasks.created';
const RABBITMQ_ROUTING_KEY_TASK_UPDATED = 'tasks.updated';
const RABBITMQ_ROUTING_KEY_COMMENT_CREATED = 'comments.created';
const RABBITMQ_ROUTING_KEY_COMMENT_UPDATED = 'comments.updated';
////////////////////////////////
// queues
const RABBITMQ_INT1_WORKER_QUEUE = 'int1worker.queue';
// dead-letter exchange + queue: a handler throw nacks the message (requeue:false),
// and the broker routes it here for later triage. See DECISIONS.md (2026-06-24).
const RABBITMQ_EVENTS_DLX = 'events.dlx';
const RABBITMQ_INT1_WORKER_DLQ = 'int1worker.dlq';

let channel, connection;

async function getChannel() {
  if (channel) {
    return channel;
  }

  connection = await amqp.connect(process.env.RABBITMQ_URL);
  channel = await connection.createChannel();
  return channel;
}

async function closeRabbitMQ() {
  await channel?.close();
  await connection?.close();
  channel = undefined;
  connection = undefined;
}

async function initRabbitMQExchange(channel) {
  await channel.assertExchange(RABBITMQ_EVENTS_EXCHANGE, 'topic', {
    durable: true,
  });

  // Dead-letter exchange + queue. Messages the worker nacks (requeue:false) are
  // routed here by the broker so failures are triaged instead of silently dropped.
  await channel.assertExchange(RABBITMQ_EVENTS_DLX, 'fanout', { durable: true });
  await channel.assertQueue(RABBITMQ_INT1_WORKER_DLQ, { durable: true });
  await channel.bindQueue(RABBITMQ_INT1_WORKER_DLQ, RABBITMQ_EVENTS_DLX, '');

  // Queue arguments are immutable: an int1worker.queue that already exists without
  // this arg must be deleted once (see README) so startup can recreate it.
  await channel.assertQueue(RABBITMQ_INT1_WORKER_QUEUE, {
    durable: true,
    arguments: { 'x-dead-letter-exchange': RABBITMQ_EVENTS_DLX },
  });
  await channel.bindQueue(
    RABBITMQ_INT1_WORKER_QUEUE,
    RABBITMQ_EVENTS_EXCHANGE,
    RABBITMQ_ROUTING_KEY_BOARD_CREATED
  );
  await channel.bindQueue(
    RABBITMQ_INT1_WORKER_QUEUE,
    RABBITMQ_EVENTS_EXCHANGE,
    RABBITMQ_ROUTING_KEY_BOARD_UPDATED
  );
  await channel.bindQueue(
    RABBITMQ_INT1_WORKER_QUEUE,
    RABBITMQ_EVENTS_EXCHANGE,
    RABBITMQ_ROUTING_KEY_TASK_CREATED
  );
  await channel.bindQueue(
    RABBITMQ_INT1_WORKER_QUEUE,
    RABBITMQ_EVENTS_EXCHANGE,
    RABBITMQ_ROUTING_KEY_TASK_UPDATED
  );
  await channel.bindQueue(
    RABBITMQ_INT1_WORKER_QUEUE,
    RABBITMQ_EVENTS_EXCHANGE,
    RABBITMQ_ROUTING_KEY_COMMENT_CREATED
  );
  await channel.bindQueue(
    RABBITMQ_INT1_WORKER_QUEUE,
    RABBITMQ_EVENTS_EXCHANGE,
    RABBITMQ_ROUTING_KEY_COMMENT_UPDATED
  );
}

async function initRabbitMQ() {
  channel = await getChannel();
  await initRabbitMQExchange(channel);
}

async function publish(routingKey, event) {
  const channel = await getChannel();
  const content = Buffer.from(JSON.stringify(event));
  channel.publish(RABBITMQ_EVENTS_EXCHANGE, routingKey, content, {
    persistent: true,
    contentType: 'application/json',
    type: event.type, // note this is outside the content attribute. This will be used by the consumers to filter the messages that they want to process
  });
}

async function consume(handler) {
  const channel = await getChannel();
  // Manual ack: hold one unacked message at a time, ack on success, and nack
  // (no requeue) on a throw so the broker dead-letters it to events.dlx.
  await channel.prefetch(1);
  await channel.consume(
    RABBITMQ_INT1_WORKER_QUEUE,
    async (msg) => {
      if (msg == null) return;

      try {
        const event = JSON.parse(msg.content.toString());
        await handler(event);
        channel.ack(msg);
      } catch (err) {
        // x-death does not carry the exception text, so log it before nacking.
        console.error('[worker] event processing failed, dead-lettering:', err);
        channel.nack(msg, false, false);
      }
    },
    { noAck: false }
  );
}

module.exports = {
  RABBITMQ_ROUTING_KEY_BOARD_CREATED,
  RABBITMQ_ROUTING_KEY_BOARD_UPDATED,
  RABBITMQ_ROUTING_KEY_TASK_CREATED,
  RABBITMQ_ROUTING_KEY_TASK_UPDATED,
  RABBITMQ_ROUTING_KEY_COMMENT_CREATED,
  RABBITMQ_ROUTING_KEY_COMMENT_UPDATED,
  getChannel,
  closeRabbitMQ,
  initRabbitMQ,
  publish,
  consume,
};
