'use strict';

const ampq = require('amqplib');

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

let channel, connection;

async function getChannel() {
  if (channel) {
    return channel;
  }

  connection = await ampq.connect(process.env.RABBITMQ_URL);
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

  await channel.assertQueue(RABBITMQ_INT1_WORKER_QUEUE, { durable: true });
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
};
