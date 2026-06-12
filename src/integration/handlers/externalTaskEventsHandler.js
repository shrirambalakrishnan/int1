'use strict';

const { Task, Board } = require('../../models');
const { resolveActor } = require('./resolveActor');

/**
 * Handles Task events that happened in the external system (inbound sync).
 * Provider agnostic — writes canonical rows only; the translator did the
 * provider work. Mirrors ExternalBoardEventsHandler.
 */
class ExternalTaskEventsHandler {
  async onExternalTaskCreated(event) {
    const {
      integrationId,
      externalBoardId,
      externalTaskId,
      title,
      description,
      actor,
    } = event.payload;

    // Tasks land *inside* a board we mirror, so the parent must exist first.
    // That's "can't do it yet", not "nothing to do" — throw so the failure is
    // loud and the provider's webhook retry redelivers after the board's own
    // event has landed; the idempotency check below makes the retry safe.
    const board = await Board.findOne({
      where: { integrationId, integrationBoardId: externalBoardId },
    });
    if (!board) {
      throw new Error(
        `[ExternalTaskEventsHandler] ExternalTaskCreated for external task ` +
          `${externalTaskId} but its external board ${externalBoardId} is not ` +
          `mirrored yet; cannot create the task locally`
      );
    }

    // Idempotency + echo suppression: a task we already mirror has nothing to
    // do (also absorbs the webhook fired back by our own outbound push).
    // Backed by the unique (boardId, integrationTaskId) index at the DB.
    const existing = await Task.findOne({
      where: { boardId: board.id, integrationTaskId: externalTaskId },
    });
    if (existing) {
      console.log(
        `[ExternalTaskEventsHandler] external task ${externalTaskId} already ` +
          `mirrored as task ${existing.id}; skipping`
      );
      return;
    }

    const createdByIntegrationUserId = await resolveActor(integrationId, actor);

    const task = await Task.create({
      title,
      description,
      boardId: board.id,
      integrationTaskId: externalTaskId,
      createdByIntegrationUserId,
      integrationUpdatedAt: new Date(),
    });

    console.log(
      `[ExternalTaskEventsHandler] mirrored external task ${externalTaskId} ` +
        `as task ${task.id} in board ${board.id}`
    );
  }

  async onExternalTaskUpdated(event) {
    const { integrationId, externalTaskId, title, description } = event.payload;

    // Task external ids are only unique per board, so scope the lookup to the
    // boards of this integration via the parent join.
    const task = await Task.findOne({
      where: { integrationTaskId: externalTaskId },
      include: { model: Board, as: 'board', where: { integrationId } },
    });

    // Update-before-create: a task we never mirrored has no local counterpart
    // to update. Skip rather than create one here — that's
    // ExternalTaskCreated's job, and acting would race it.
    if (!task) {
      console.warn(
        `[ExternalTaskEventsHandler] ExternalTaskUpdated for unmirrored ` +
          `external task ${externalTaskId}; skipping`
      );
      return;
    }

    await task.update({ title, description, integrationUpdatedAt: new Date() });
  }
}

module.exports = { ExternalTaskEventsHandler };
