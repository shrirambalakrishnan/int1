'use strict';

/**
 * Drives the integration worker without a broker: builds a BoardUpdated event
 * (validated by its schema) and calls processEvent() directly. RabbitMQ will
 * replace this trigger later.
 *
 * Usage: node scripts/emitBoardUpdated.js <boardId> <integrationId>
 */
require('dotenv').config();

const sequelize = require('../src/db/index');
const { processEvent } = require('../src/integration/eventProcessor');
const { buildEvent } = require('../src/integration/events');

async function main() {
  const boardId = Number(process.argv[2]);
  const integrationId = Number(process.argv[3]);

  if (!Number.isInteger(boardId) || !Number.isInteger(integrationId)) {
    console.error('Usage: node scripts/emitBoardUpdated.js <boardId> <integrationId>');
    process.exit(1);
  }

  await sequelize.authenticate();

  const event = buildEvent('BoardUpdated', { boardId, integrationId });

  console.log('[emitBoardUpdated] processing', event);
  await processEvent(event);
  console.log('[emitBoardUpdated] done');

  await sequelize.close();
}

main().catch(async (err) => {
  console.error('[emitBoardUpdated] failed:', err);
  await sequelize.close();
  process.exit(1);
});
