'use strict';

const { Comment, Task, Board } = require('../../models');
const { resolveActor } = require('./resolveActor');

/**
 * Handles Comment events that happened in the external system (inbound sync).
 * Provider agnostic — writes canonical rows only; the translator did the
 * provider work. Mirrors ExternalBoardEventsHandler.
 */
class ExternalCommentEventsHandler {
  async onExternalCommentCreated(event) {
    const { integrationId, externalTaskId, externalCommentId, content, actor } =
      event.payload;

    // Comments land *on* a task we mirror, so the parent must exist first.
    // "Can't do it yet" — throw so the provider's webhook retry redelivers
    // after the task's own event has landed; the idempotency check below makes
    // the retry safe.
    const task = await Task.findOne({
      where: { integrationTaskId: externalTaskId },
      include: { model: Board, as: 'board', where: { integrationId } },
    });
    if (!task) {
      throw new Error(
        `[ExternalCommentEventsHandler] ExternalCommentCreated for external ` +
          `comment ${externalCommentId} but its external task ${externalTaskId} ` +
          `is not mirrored yet; cannot create the comment locally`
      );
    }

    // Idempotency + echo suppression: a comment we already mirror has nothing
    // to do (also absorbs the webhook fired back by our own outbound push).
    // Backed by the unique (taskId, integrationCommentId) index at the DB.
    const existing = await Comment.findOne({
      where: { taskId: task.id, integrationCommentId: externalCommentId },
    });
    if (existing) {
      console.log(
        `[ExternalCommentEventsHandler] external comment ${externalCommentId} ` +
          `already mirrored as comment ${existing.id}; skipping`
      );
      return;
    }

    const createdByIntegrationUserId = await resolveActor(integrationId, actor);

    const comment = await Comment.create({
      content,
      taskId: task.id,
      integrationCommentId: externalCommentId,
      createdByIntegrationUserId,
      integrationUpdatedAt: new Date(),
    });

    console.log(
      `[ExternalCommentEventsHandler] mirrored external comment ` +
        `${externalCommentId} as comment ${comment.id} on task ${task.id}`
    );
  }

  async onExternalCommentUpdated(event) {
    const { integrationId, externalCommentId, content } = event.payload;

    // Comment external ids are only unique per task, so scope the lookup to
    // this integration via the task -> board join.
    const comment = await Comment.findOne({
      where: { integrationCommentId: externalCommentId },
      include: {
        model: Task,
        as: 'task',
        include: { model: Board, as: 'board', where: { integrationId } },
        required: true,
      },
    });

    // Update-before-create: a comment we never mirrored has no local
    // counterpart to update. Skip rather than create one here — that's
    // ExternalCommentCreated's job, and acting would race it.
    if (!comment) {
      console.warn(
        `[ExternalCommentEventsHandler] ExternalCommentUpdated for unmirrored ` +
          `external comment ${externalCommentId}; skipping`
      );
      return;
    }

    await comment.update({ content, integrationUpdatedAt: new Date() });
  }
}

module.exports = { ExternalCommentEventsHandler };
