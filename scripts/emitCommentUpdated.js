'use strict';

/**
 * Drives the integration worker without a broker: builds a CommentUpdated event
 * (validated by its schema) and calls processEvent() directly. RabbitMQ will
 * replace this trigger later.
 *
 * Usage: node scripts/emitCommentUpdated.js <commentId> <integrationId>
 */
require('dotenv').config();

const sequelize = require('../src/db/index');
const { Comment } = require('../src/models');
const { processEvent } = require('../src/integration/eventProcessor');
const { buildEvent } = require('../src/integration/events');

async function main() {
  const commentId = Number(process.argv[2]);
  const integrationId = Number(process.argv[3]);

  if (!Number.isInteger(commentId) || !Number.isInteger(integrationId)) {
    console.error('Usage: node scripts/emitCommentUpdated.js <commentId> <integrationId>');
    process.exit(1);
  }

  await sequelize.authenticate();

  // The event carries the comment data; pull it from the local row (the
  // publisher always has the entity it just wrote).
  const comment = await Comment.findByPk(commentId);
  if (!comment) {
    console.error(`[emitCommentUpdated] no comment with id ${commentId}`);
    process.exit(1);
  }

  const event = buildEvent('CommentUpdated', {
    commentId,
    integrationId,
    content: comment.content,
  });

  console.log('[emitCommentUpdated] processing', event);
  await processEvent(event);
  console.log('[emitCommentUpdated] done');

  await sequelize.close();
}

main().catch(async (err) => {
  console.error('[emitCommentUpdated] failed:', err);
  await sequelize.close();
  process.exit(1);
});
