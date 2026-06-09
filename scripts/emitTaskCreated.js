'use strict';

/**
 * Drives the integration worker without a broker: builds a TaskCreated event
 * (validated by its schema) and calls processEvent() directly. RabbitMQ will
 * replace this trigger later.
 *
 * Usage: node scripts/emitTaskCreated.js <taskId> <integrationId>
 */
require('dotenv').config();

const sequelize = require('../src/db/index');
const { Task } = require('../src/models');
const { processEvent } = require('../src/integration/eventProcessor');
const { buildEvent } = require('../src/integration/events');

async function main() {
  const taskId = Number(process.argv[2]);
  const integrationId = Number(process.argv[3]);

  if (!Number.isInteger(taskId) || !Number.isInteger(integrationId)) {
    console.error('Usage: node scripts/emitTaskCreated.js <taskId> <integrationId>');
    process.exit(1);
  }

  await sequelize.authenticate();

  // The event carries the task data; pull it from the local row (the publisher
  // always has the entity it just wrote).
  const task = await Task.findByPk(taskId);
  if (!task) {
    console.error(`[emitTaskCreated] no task with id ${taskId}`);
    process.exit(1);
  }

  const event = buildEvent('TaskCreated', {
    taskId,
    integrationId,
    title: task.title,
    description: task.description,
  });

  console.log('[emitTaskCreated] processing', event);
  await processEvent(event);
  console.log('[emitTaskCreated] done');

  await sequelize.close();
}

main().catch(async (err) => {
  console.error('[emitTaskCreated] failed:', err);
  await sequelize.close();
  process.exit(1);
});
