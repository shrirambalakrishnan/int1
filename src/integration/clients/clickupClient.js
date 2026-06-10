'use strict';

const { selectAuthStrategy } = require('../auth/selectAuthStrategy');

/**
 * ClickUp integration client (API v2). Same surface as stubClient so
 * selectIntegration can hand either to the handlers.
 *
 * Mapping: an int1 Board is a ClickUp List, created folderless in the single
 * Space pinned by CLICKUP_SPACE_ID (tasks can only live in Lists, and Spaces
 * are capped at 5 on the free plan — so Boards map a level below Space).
 *
 * Config is read lazily, per call: CLICKUP_API_TOKEN is exported from the
 * Keychain into the shell (see README "Secrets") and CLICKUP_SPACE_ID comes
 * from .env, so neither is guaranteed to exist at module load.
 */
const BASE_URL = 'https://api.clickup.com/api/v2';

function spaceId() {
  const id = process.env.CLICKUP_SPACE_ID;
  if (!id) {
    throw new Error('[clickupClient] CLICKUP_SPACE_ID is not set');
  }
  return id;
}

async function request(method, path, body) {
  const auth = selectAuthStrategy('token', {
    token: process.env.CLICKUP_API_TOKEN,
  });

  const doFetch = async () =>
    fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(await auth.getAuthHeaders()),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  let res = await doFetch();

  // Free plan allows 100 requests/min. On 429 ClickUp sends the window end in
  // X-RateLimit-Reset (unix seconds); wait it out and retry once, then give up
  // and let the thrown error become a redelivery once a broker fronts this.
  if (res.status === 429) {
    const resetAt = Number(res.headers.get('x-ratelimit-reset')) * 1000;
    const waitMs = Math.min(Math.max(resetAt - Date.now(), 1_000), 60_000);
    console.warn(`[clickupClient] rate limited; retrying in ${waitMs}ms`);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    res = await doFetch();
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    // ClickUp errors carry { err, ECODE }; surface both for debugging.
    throw new Error(
      `[clickupClient] ${method} ${path} -> ${res.status}: ` +
        `${data.err || 'unknown error'} (ECODE: ${data.ECODE || 'n/a'})`
    );
  }

  return data;
}

/**
 * Creates the board as a folderless List in the configured Space. ClickUp ids
 * are opaque strings; return as-is for integrationBoardId.
 */
async function createBoard(board) {
  const list = await request('POST', `/space/${spaceId()}/list`, {
    name: board.name,
  });
  console.log(
    `[clickupClient] created board "${board.name}" (local id ${board.id}) ` +
      `remotely as list ${list.id}`
  );
  return String(list.id);
}

/**
 * Pushes a board rename to the external system. The board is already
 * integrated, so its List is addressed by integrationBoardId. Name is the
 * only Board attribute int1 owns; ClickUp-side fields stay untouched.
 */
async function updateBoard(board) {
  await request('PUT', `/list/${board.integrationBoardId}`, {
    name: board.name,
  });
  console.log(
    `[clickupClient] updated board "${board.name}" (local id ${board.id}) ` +
      `remotely as list ${board.integrationBoardId}`
  );
}

/**
 * Creates the task in its parent board's List — the handler passes the board
 * in so the client stays DB-free. The task lands in the List's default status
 * with no assignees (assignee mapping is deferred until IntegrationUser holds
 * real ClickUp member ids). Task ids are alphanumeric strings.
 */
async function createTask(task, board) {
  const body = { name: task.title };
  if (task.description != null) {
    body.description = task.description;
  }
  const created = await request(
    'POST',
    `/list/${board.integrationBoardId}/task`,
    body
  );
  console.log(
    `[clickupClient] created task "${task.title}" (local id ${task.id}) ` +
      `remotely as ${created.id} in list ${board.integrationBoardId}`
  );
  return String(created.id);
}

/**
 * Pushes a task edit to the external system. Task ids are workspace-global in
 * ClickUp, so the task addresses itself by integrationTaskId — no parent
 * needed. ClickUp's PUT only touches the fields sent, so unsynced attributes
 * (status, priority, ...) stay as they are remotely.
 */
async function updateTask(task) {
  const body = { name: task.title };
  if (task.description != null) {
    body.description = task.description;
  }
  await request('PUT', `/task/${task.integrationTaskId}`, body);
  console.log(
    `[clickupClient] updated task "${task.title}" (local id ${task.id}) ` +
      `remotely as ${task.integrationTaskId}`
  );
}

/**
 * Creates the comment on its parent task's remote counterpart — the handler
 * passes the task in so the client stays DB-free. notify_all stays false:
 * every synced comment pinging watchers would be noise, not signal.
 */
async function createComment(comment, task) {
  const created = await request(
    'POST',
    `/task/${task.integrationTaskId}/comment`,
    { comment_text: comment.content, notify_all: false }
  );
  console.log(
    `[clickupClient] created comment (local id ${comment.id}) ` +
      `remotely as ${created.id} on task ${task.integrationTaskId}`
  );
  return String(created.id);
}

/**
 * Pushes a comment edit to the external system. Comment ids are global in
 * ClickUp, so the comment addresses itself by integrationCommentId — no
 * parent needed.
 */
async function updateComment(comment) {
  await request('PUT', `/comment/${comment.integrationCommentId}`, {
    comment_text: comment.content,
  });
  console.log(
    `[clickupClient] updated comment (local id ${comment.id}) ` +
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
