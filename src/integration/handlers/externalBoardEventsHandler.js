'use strict';

const { Board } = require('../../models');
const { resolveActor } = require('./resolveActor');

/**
 * Handles Board events that happened in the external system (inbound sync).
 * Provider agnostic: the webhook translator already verified the delivery,
 * fetched the data, and built a validated External* event — this handler only
 * writes canonical rows. Mirror image of BoardEventsHandler: entities are
 * addressed by external id, and the guard semantics invert.
 */
class ExternalBoardEventsHandler {
  async onExternalBoardCreated(event) {
    const { integrationId, externalBoardId, name, actor } = event.payload;

    // Idempotency + echo suppression: a board we already mirror has nothing to
    // do. This also absorbs the webhook the provider fires back when *we*
    // pushed the board outbound. Backed by the unique
    // (integrationId, integrationBoardId) index at the DB.
    const existing = await Board.findOne({
      where: { integrationId, integrationBoardId: externalBoardId },
    });
    if (existing) {
      console.log(
        `[ExternalBoardEventsHandler] external board ${externalBoardId} ` +
          `already mirrored as board ${existing.id}; skipping`
      );
      return;
    }

    const createdByIntegrationUserId = await resolveActor(integrationId, actor);

    const board = await Board.create({
      name,
      integrationId,
      integrationBoardId: externalBoardId,
      createdByIntegrationUserId,
      integrationUpdatedAt: new Date(),
    });

    console.log(
      `[ExternalBoardEventsHandler] mirrored external board ${externalBoardId} ` +
        `as board ${board.id}`
    );
  }

  async onExternalBoardUpdated(event) {
    const { integrationId, externalBoardId, name } = event.payload;

    // Update-before-create: a board we never mirrored has no local counterpart
    // to update. Skip rather than create one here — that's
    // ExternalBoardCreated's job, and acting would race it.
    const board = await Board.findOne({
      where: { integrationId, integrationBoardId: externalBoardId },
    });
    if (!board) {
      console.warn(
        `[ExternalBoardEventsHandler] ExternalBoardUpdated for unmirrored ` +
          `external board ${externalBoardId}; skipping`
      );
      return;
    }

    await board.update({ name, integrationUpdatedAt: new Date() });
  }
}

module.exports = { ExternalBoardEventsHandler };
