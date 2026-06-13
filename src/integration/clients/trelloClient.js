'use strict';

const { selectAuthStrategy } = require('../auth/selectAuthStrategy');
const { createRequest } = require('./request');

/**
 * Trello integration client (REST API v1). Same surface as stubClient so
 * selectIntegration can hand either to the handlers.
 *
 * Mapping: an int1 Board is a Trello List, created on the single Board pinned
 * by TRELLO_BOARD_ID (cards can only live in Lists, never directly on a
 * Board — so Boards map a level below Trello's Board, same reasoning as
 * ClickUp's Space and Asana's Workspace). A comment is a commentCard Action,
 * so integrationCommentId holds an action id.
 *
 * Config is read lazily, per call: TRELLO_API_KEY and TRELLO_API_TOKEN are
 * exported from the Keychain into the shell (see README "Secrets") and
 * TRELLO_BOARD_ID comes from .env, so none are guaranteed to exist at module
 * load.
 */
const BASE_URL = 'https://api.trello.com/1';

function boardId() {
  const id = process.env.TRELLO_BOARD_ID;
  if (!id) {
    throw new Error('[trelloClient] TRELLO_BOARD_ID is not set');
  }
  return id;
}

/**
 * Trello authenticates every request with an API key (identifies the app)
 * plus a user token, both carried in one header:
 *   Authorization: OAuth oauth_consumer_key="...", oauth_token="..."
 * No signing involved — the scheme just borrows OAuth 1.0's header shape.
 * The header keeps both credentials out of URLs, which matter here because
 * request paths end up in thrown error messages and logs (the query-string
 * alternative would leak the token into both).
 *
 * Checked individually before composing: a missing env var would otherwise
 * hide inside a non-empty composed string and surface as a confusing 401.
 */
function authStrategy() {
  const key = process.env.TRELLO_API_KEY;
  const token = process.env.TRELLO_API_TOKEN;
  if (!key) {
    throw new Error('[trelloClient] TRELLO_API_KEY is not set');
  }
  if (!token) {
    throw new Error('[trelloClient] TRELLO_API_TOKEN is not set');
  }
  return selectAuthStrategy('token', {
    token: `oauth_consumer_key="${key}", oauth_token="${token}"`,
    scheme: 'OAuth',
  });
}

const request = createRequest({
  name: 'trelloClient',
  baseUrl: BASE_URL,
  authStrategy,
  // Limits are 100 requests per token (300 per key) in fixed 10-second
  // windows, and the 429 carries no retry header — wait out one full window.
  retryDelayMs: () => 10_000,
  // Trello errors are often plain text ("invalid key", "invalid id"), only
  // sometimes JSON ({ message }).
  errorMessage: (json, text) => json.message || text,
});

/**
 * Creates the board as a List on the configured Trello Board. Trello ids are
 * 24-char hex strings; return as-is for integrationBoardId.
 */
async function createBoard(board) {
  const list = await request('POST', '/lists', {
    name: board.name,
    idBoard: boardId(),
  });
  console.log(
    `[trelloClient] created board "${board.name}" (local id ${board.id}) ` +
      `remotely as list ${list.id}`
  );
  return String(list.id);
}

/**
 * Pushes a board rename to the external system. The board is already
 * integrated, so its List is addressed by integrationBoardId. Name is the
 * only Board attribute int1 owns; Trello-side fields stay untouched.
 */
async function updateBoard(board) {
  await request('PUT', `/lists/${board.integrationBoardId}`, {
    name: board.name,
  });
  console.log(
    `[trelloClient] updated board "${board.name}" (local id ${board.id}) ` +
      `remotely as list ${board.integrationBoardId}`
  );
}

/**
 * Creates the task as a Card in its parent board's List — the handler passes
 * the board in so the client stays DB-free. The card lands unassigned at the
 * bottom of the list (member mapping is deferred until IntegrationUser holds
 * real Trello member ids).
 */
async function createTask(task, board) {
  const body = { idList: board.integrationBoardId, name: task.title };
  if (task.description != null) {
    body.desc = task.description;
  }
  const created = await request('POST', '/cards', body);
  console.log(
    `[trelloClient] created task "${task.title}" (local id ${task.id}) ` +
      `remotely as card ${created.id} in list ${board.integrationBoardId}`
  );
  return String(created.id);
}

/**
 * Pushes a task edit to the external system. Card ids are global in Trello,
 * so the task addresses itself by integrationTaskId — no parent needed.
 * Trello's PUT only touches the fields sent, so unsynced attributes (labels,
 * due date, ...) stay as they are remotely.
 */
async function updateTask(task) {
  const body = { name: task.title };
  if (task.description != null) {
    body.desc = task.description;
  }
  await request('PUT', `/cards/${task.integrationTaskId}`, body);
  console.log(
    `[trelloClient] updated task "${task.title}" (local id ${task.id}) ` +
      `remotely as card ${task.integrationTaskId}`
  );
}

/**
 * Creates the comment on its parent task's remote card — the handler passes
 * the task in so the client stays DB-free. Trello models a comment as a
 * commentCard Action, so the returned id is an action id.
 */
async function createComment(comment, task) {
  const created = await request(
    'POST',
    `/cards/${task.integrationTaskId}/actions/comments`,
    { text: comment.content }
  );
  console.log(
    `[trelloClient] created comment (local id ${comment.id}) ` +
      `remotely as action ${created.id} on card ${task.integrationTaskId}`
  );
  return String(created.id);
}

/**
 * Pushes a comment edit to the external system. Action ids are global in
 * Trello, so the comment addresses itself by integrationCommentId — no parent
 * needed. Trello only allows updating comment-type actions, and only by the
 * member who created them — both always true here, since this client created
 * the comment with the same token it edits with.
 */
async function updateComment(comment) {
  await request('PUT', `/actions/${comment.integrationCommentId}/text`, {
    value: comment.content,
  });
  console.log(
    `[trelloClient] updated comment (local id ${comment.id}) ` +
      `remotely as action ${comment.integrationCommentId}`
  );
}

// ---------------------------------------------------------------------------
// Inbound reads — used by the webhook translator to enrich Trello webhook
// deliveries. Trello action payloads are fatter than ClickUp's/Asana's, but a
// createCard omits the desc and an updateCard carries only the changed fields,
// so the full entity is fetched to build complete canonical rows. These are NOT
// part of the cross-provider client contract (still the six methods above,
// resolved via selectIntegration); the inbound path is Trello-specific and
// imports this module directly.

/** Fetches a List (the remote counterpart of a Board). */
async function getList(listId) {
  return request('GET', `/lists/${listId}`);
}

/** Fetches a Card. `idList` on the result locates the parent board. */
async function getCard(cardId) {
  return request('GET', `/cards/${cardId}`);
}

/**
 * Fetches a comment Action (the remote counterpart of a Comment). `data.text`
 * is the comment body; `data.card.id` is the parent card. Editing a comment
 * updates this same action, so a GET always returns the current text.
 */
async function getCommentAction(actionId) {
  return request('GET', `/actions/${actionId}`);
}

module.exports = {
  createBoard,
  updateBoard,
  createTask,
  updateTask,
  createComment,
  updateComment,
  getList,
  getCard,
  getCommentAction,
  // For tooling that owns its own Trello calls (webhook registration script);
  // not for handlers, which stay behind the six-method contract.
  request,
};
