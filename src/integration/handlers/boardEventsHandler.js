'use strict';

const { Board } = require('../../models');
const { selectIntegration } = require('../selectIntegration');

/**
 * Handles Board-related integration events. Orchestration only — provider
 * agnostic. It loads the entity, resolves the right integration client, calls a
 * uniform method, and persists the result. It knows nothing about how the event
 * was delivered (script today, RabbitMQ later).
 */
class BoardEventsHandler {
  async onBoardCreated(event) {
    const { boardId, integrationId } = event.payload;

    const board = await Board.findByPk(boardId);
    if (!board) {
      console.warn(
        `[BoardEventsHandler] BoardCreated for missing board ${boardId}; skipping`
      );
      return;
    }

    // Idempotency: a board already integrated has nothing to do. Handles
    // redelivery/retry once RabbitMQ is in front of this. Backed by the unique
    // (integrationId, integrationBoardId) index at the DB.
    if (board.integrationBoardId != null) {
      console.log(
        `[BoardEventsHandler] board ${board.id} already integrated ` +
          `(integrationBoardId=${board.integrationBoardId}); skipping`
      );
      return;
    }

    const client = await selectIntegration(integrationId);
    const externalId = await client.createBoard(board);

    await board.update({
      integrationBoardId: externalId,
      integrationUpdatedAt: new Date(),
    });
  }

  async onBoardUpdated(event) {
    const { boardId, integrationId } = event.payload;

    const board = await Board.findByPk(boardId);
    if (!board) {
      console.warn(
        `[BoardEventsHandler] BoardUpdated for missing board ${boardId}; skipping`
      );
      return;
    }

    // Inverse of BoardCreated: a board that was never integrated has no remote
    // counterpart to update. Skip rather than create one here — that's
    // BoardCreated's job, and acting would race it.
    if (board.integrationBoardId == null) {
      console.warn(
        `[BoardEventsHandler] BoardUpdated for un-integrated board ${board.id}; skipping`
      );
      return;
    }

    const client = await selectIntegration(integrationId);
    await client.updateBoard(board);

    await board.update({ integrationUpdatedAt: new Date() });
  }
}

module.exports = { BoardEventsHandler };
