'use strict';

/**
 * Drives the integration worker without a broker: builds a BoardCreated event
 * and calls processEvent() directly. RabbitMQ will replace this trigger later.
 *
 * Usage: node scripts/emitBoardCreated.js <boardId> [integrationId]
 */
require('dotenv').config();

const sequelize = require('../src/db/index');
const { processEvent } = require('../src/integration/eventProcessor');

async function main() {
  const boardId = Number(process.argv[2]);
  const integrationId =
    process.argv[3] !== undefined ? Number(process.argv[3]) : undefined;

  if (!Number.isInteger(boardId)) {
    console.error('Usage: node scripts/emitBoardCreated.js <boardId> [integrationId]');
    process.exit(1);
  }

  await sequelize.authenticate();

  const event = {
    type: 'BoardCreated',
    boardId,
    integrationId,
    occurredAt: new Date().toISOString(),
  };

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
