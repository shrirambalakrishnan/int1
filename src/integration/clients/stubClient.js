'use strict';

/**
 * Stub integration client. Stands in for a real provider (Asana/Jira/Linear)
 * until we have credentials and a concrete API to call. It simulates creating
 * the board in the external system and returns a synthetic external id.
 *
 * External ids are strings (real providers use opaque, sometimes alphanumeric
 * handles — e.g. ClickUp task ids), so the synthetic ids are stringified too.
 */
async function createBoard(board) {
  const externalId = String(Math.floor(Math.random() * 1e9));
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
 * external id (a string, like createBoard). Takes the parent board like the
 * real clients do — providers create tasks *inside* a board's remote
 * counterpart — though the stub has no use for it.
 */
async function createTask(task, board) {
  const externalId = String(Math.floor(Math.random() * 1e9));
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

/**
 * Simulates creating the comment in the external system, returning a synthetic
 * external id (a string, like createBoard).
 */
async function createComment(comment) {
  const externalId = String(Math.floor(Math.random() * 1e9));
  console.log(
    `[stubClient] created comment (local id ${comment.id}) ` +
      `remotely as ${externalId}`
  );
  return externalId;
}

/**
 * Simulates pushing a comment update to the external system. The comment is
 * already integrated, so we address it by its existing integrationCommentId.
 */
async function updateComment(comment) {
  console.log(
    `[stubClient] updated comment (local id ${comment.id}) ` +
      `remotely as ${comment.integrationCommentId}`
  );
}

module.exports = {
  createBoard,
  updateBoard,
  createTask,
  updateTask,
  createComment,
  updateComment,
};
