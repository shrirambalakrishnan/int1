'use strict';

const { Task, Board } = require('../../models');
const { selectIntegration } = require('../selectIntegration');

/**
 * Handles Task-related integration events. Orchestration only — provider
 * agnostic. It loads the entity, resolves the right integration client, calls a
 * uniform method, and persists the result. It knows nothing about how the event
 * was delivered (script today, RabbitMQ later). Mirrors BoardEventsHandler.
 */
class TaskEventsHandler {
  async onTaskCreated(event) {
    const { taskId, integrationId } = event.payload;

    const task = await Task.findByPk(taskId);
    if (!task) {
      console.warn(
        `[TaskEventsHandler] TaskCreated for missing task ${taskId}; skipping`
      );
      return;
    }

    // Idempotency: a task already integrated has nothing to do. Handles
    // redelivery/retry once RabbitMQ is in front of this. Backed by the unique
    // (boardId, integrationTaskId) index at the DB.
    if (task.integrationTaskId != null) {
      console.log(
        `[TaskEventsHandler] task ${task.id} already integrated ` +
          `(integrationTaskId=${task.integrationTaskId}); skipping`
      );
      return;
    }

    // Tasks are created *inside* the board's remote counterpart, so the
    // parent must be integrated first. Unlike the skip-guards above ("nothing
    // to do"), an un-integrated parent is "can't do it yet" — throw so the
    // failure is loud today and becomes a redelivery once a broker fronts
    // this; the idempotency check makes the eventual retry safe.
    const board = await Board.findByPk(task.boardId);
    if (!board || board.integrationBoardId == null) {
      throw new Error(
        `[TaskEventsHandler] TaskCreated for task ${task.id} but its board ` +
          `${task.boardId} is ${board ? 'not integrated yet' : 'missing'}; ` +
          `cannot create the task remotely`
      );
    }

    const client = await selectIntegration(integrationId);
    const externalId = await client.createTask(task, board);

    await task.update({
      integrationTaskId: externalId,
      integrationUpdatedAt: new Date(),
    });
  }

  async onTaskUpdated(event) {
    const { taskId, integrationId } = event.payload;

    const task = await Task.findByPk(taskId);
    if (!task) {
      console.warn(
        `[TaskEventsHandler] TaskUpdated for missing task ${taskId}; skipping`
      );
      return;
    }

    // Inverse of TaskCreated: a task that was never integrated has no remote
    // counterpart to update. Skip rather than create one here — that's
    // TaskCreated's job, and acting would race it.
    if (task.integrationTaskId == null) {
      console.warn(
        `[TaskEventsHandler] TaskUpdated for un-integrated task ${task.id}; skipping`
      );
      return;
    }

    const client = await selectIntegration(integrationId);
    await client.updateTask(task);

    await task.update({ integrationUpdatedAt: new Date() });
  }
}

module.exports = { TaskEventsHandler };
