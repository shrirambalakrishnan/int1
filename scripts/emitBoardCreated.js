'use strict';

/**
 * Drives the integration worker without a broker: builds a BoardCreated event
 * (validated by its schema) and calls processEvent() directly. RabbitMQ will
 * replace this trigger later.
 *
 * Usage: node scripts/emitBoardCreated.js <boardId> <integrationId>
 */
require('dotenv').config();

const sequelize = require('../src/db/index');
const { processEvent } = require('../src/integration/eventProcessor');
const { buildEvent } = require('../src/integration/events');

async function main() {
  const boardId = Number(process.argv[2]);
  const integrationId = Number(process.argv[3]);

  if (!Number.isInteger(boardId) || !Number.isInteger(integrationId)) {
    console.error('Usage: node scripts/emitBoardCreated.js <boardId> <integrationId>');
    process.exit(1);
  }

  await sequelize.authenticate();

  const event = buildEvent('BoardCreated', { boardId, integrationId });

  console.log('[emitBoardCreated] processing', event);
  await processEvent(event);
  console.log('[emitBoardCreated] done');

  await sequelize.close();
}

main().catch(async (err) => {
  console.error('[emitBoardCreated] failed:', err);
  await sequelize.close();
  process.exit(1);
});
