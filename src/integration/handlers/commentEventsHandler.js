'use strict';

const { Comment, Task } = require('../../models');
const { selectIntegration } = require('../selectIntegration');

/**
 * Handles Comment-related integration events. Orchestration only — provider
 * agnostic. It loads the entity, resolves the right integration client, calls a
 * uniform method, and persists the result. It knows nothing about how the event
 * was delivered (script today, RabbitMQ later). Mirrors BoardEventsHandler.
 */
class CommentEventsHandler {
  async onCommentCreated(event) {
    const { commentId, integrationId } = event.payload;

    const comment = await Comment.findByPk(commentId);
    if (!comment) {
      console.warn(
        `[CommentEventsHandler] CommentCreated for missing comment ${commentId}; skipping`
      );
      return;
    }

    // Idempotency: a comment already integrated has nothing to do. Handles
    // redelivery/retry once RabbitMQ is in front of this. Backed by the unique
    // (taskId, integrationCommentId) index at the DB.
    if (comment.integrationCommentId != null) {
      console.log(
        `[CommentEventsHandler] comment ${comment.id} already integrated ` +
          `(integrationCommentId=${comment.integrationCommentId}); skipping`
      );
      return;
    }

    // Comments are created *on* the task's remote counterpart, so the parent
    // must be integrated first. Unlike the skip-guards above ("nothing to
    // do"), an un-integrated parent is "can't do it yet" — throw so the
    // failure is loud today and becomes a redelivery once a broker fronts
    // this; the idempotency check makes the eventual retry safe.
    const task = await Task.findByPk(comment.taskId);
    if (!task || task.integrationTaskId == null) {
      throw new Error(
        `[CommentEventsHandler] CommentCreated for comment ${comment.id} but ` +
          `its task ${comment.taskId} is ` +
          `${task ? 'not integrated yet' : 'missing'}; ` +
          `cannot create the comment remotely`
      );
    }

    const client = await selectIntegration(integrationId);
    const externalId = await client.createComment(comment, task);

    await comment.update({
      integrationCommentId: externalId,
      integrationUpdatedAt: new Date(),
    });
  }

  async onCommentUpdated(event) {
    const { commentId, integrationId } = event.payload;

    const comment = await Comment.findByPk(commentId);
    if (!comment) {
      console.warn(
        `[CommentEventsHandler] CommentUpdated for missing comment ${commentId}; skipping`
      );
      return;
    }

    // Inverse of CommentCreated: a comment that was never integrated has no
    // remote counterpart to update. Skip rather than create one here — that's
    // CommentCreated's job, and acting would race it.
    if (comment.integrationCommentId == null) {
      console.warn(
        `[CommentEventsHandler] CommentUpdated for un-integrated comment ${comment.id}; skipping`
      );
      return;
    }

    const client = await selectIntegration(integrationId);
    await client.updateComment(comment);

    await comment.update({ integrationUpdatedAt: new Date() });
  }
}

module.exports = { CommentEventsHandler };
