'use strict';

/**
 * Stub integration client. Stands in for a real provider (Asana/Jira/Linear)
 * until we have credentials and a concrete API to call. It simulates creating
 * the board in the external system and returns a synthetic external id.
 *
 * NOTE: Board.integrationBoardId is a Postgres INTEGER, so the synthetic id must
 * fit in a 32-bit int — keep it < 1e9. (Date.now() in ms would overflow.)
 */
async function createBoard(board) {
  const externalId = Math.floor(Math.random() * 1e9);
  console.log(
    `[stubClient] created board "${board.name}" (local id ${board.id}) ` +
      `remotely as ${externalId}`
  );
  return externalId;
}

/**
 * Simulates pushing a board update to the external system. The board is already
 * integrated, so we address it by its existing integrationBoardId.
 */
async function updateBoard(board) {
  console.log(
    `[stubClient] updated board "${board.name}" (local id ${board.id}) ` +
      `remotely as ${board.integrationBoardId}`
  );
}

/**
 * Simulates creating the task in the external system, returning a synthetic
 * external id. Same 32-bit INTEGER constraint as createBoard — keep it < 1e9.
 */
async function createTask(task) {
  const externalId = Math.floor(Math.random() * 1e9);
  console.log(
    `[stubClient] created task "${task.title}" (local id ${task.id}) ` +
      `remotely as ${externalId}`
  );
  return externalId;
}

/**
 * Simulates pushing a task update to the external system. The task is already
 * integrated, so we address it by its existing integrationTaskId.
 */
async function updateTask(task) {
  console.log(
    `[stubClient] updated task "${task.title}" (local id ${task.id}) ` +
      `remotely as ${task.integrationTaskId}`
  );
}

module.exports = { createBoard, updateBoard, createTask, updateTask };
