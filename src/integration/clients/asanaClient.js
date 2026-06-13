'use strict';

const { selectAuthStrategy } = require('../auth/selectAuthStrategy');
const { createRequest } = require('./request');

/**
 * Asana integration client (API 1.0). Same surface as stubClient so
 * selectIntegration can hand either to the handlers.
 *
 * Mapping: an int1 Board is an Asana Project, created in the single Workspace
 * pinned by ASANA_WORKSPACE_ID (every project must live in a workspace, and
 * that level is account config, not synced data — same reasoning as ClickUp's
 * Space). If the workspace is an organization Asana also requires a team on
 * project creation; ASANA_TEAM_ID covers that and is otherwise left unset.
 *
 * Config is read lazily, per call: ASANA_API_TOKEN is exported from the
 * Keychain into the shell (see README "Secrets") and ASANA_WORKSPACE_ID comes
 * from .env, so neither is guaranteed to exist at module load.
 */
const BASE_URL = 'https://app.asana.com/api/1.0';

function workspaceId() {
  const id = process.env.ASANA_WORKSPACE_ID;
  if (!id) {
    throw new Error('[asanaClient] ASANA_WORKSPACE_ID is not set');
  }
  return id;
}

const request = createRequest({
  name: 'asanaClient',
  baseUrl: BASE_URL,
  authStrategy: () =>
    selectAuthStrategy('token', {
      token: process.env.ASANA_API_TOKEN,
      scheme: 'Bearer',
    }),
  // Free plan allows 150 requests/min. On 429 Asana sends Retry-After (seconds).
  retryDelayMs: (res) => Number(res.headers.get('retry-after')) * 1000,
  // Asana errors carry { errors: [{ message, help }] }; surface the messages.
  errorMessage: (json) => (json.errors || []).map((e) => e.message).join('; '),
  // Asana wraps every request and response in a { data } envelope.
  wrapBody: (body) => ({ data: body }),
  unwrapResponse: (json) => json.data,
});

/**
 * Creates the board as a Project in the configured Workspace. Asana gids are
 * numeric strings that exceed 32 bits; return as-is for integrationBoardId.
 */
async function createBoard(board) {
  const body = { name: board.name, workspace: workspaceId() };
  if (process.env.ASANA_TEAM_ID) {
    body.team = process.env.ASANA_TEAM_ID;
  }
  const project = await request('POST', '/projects', body);
  console.log(
    `[asanaClient] created board "${board.name}" (local id ${board.id}) ` +
      `remotely as project ${project.gid}`
  );
  return String(project.gid);
}

/**
 * Pushes a board rename to the external system. The board is already
 * integrated, so its Project is addressed by integrationBoardId. Name is the
 * only Board attribute int1 owns; Asana-side fields stay untouched.
 */
async function updateBoard(board) {
  await request('PUT', `/projects/${board.integrationBoardId}`, {
    name: board.name,
  });
  console.log(
    `[asanaClient] updated board "${board.name}" (local id ${board.id}) ` +
      `remotely as project ${board.integrationBoardId}`
  );
}

/**
 * Creates the task in its parent board's Project — the handler passes the
 * board in so the client stays DB-free. Asana attaches tasks to projects via
 * the `projects` array (no workspace needed when a project is given). The
 * task lands unassigned (assignee mapping is deferred until IntegrationUser
 * holds real Asana user gids).
 */
async function createTask(task, board) {
  const body = { name: task.title, projects: [board.integrationBoardId] };
  if (task.description != null) {
    body.notes = task.description;
  }
  const created = await request('POST', '/tasks', body);
  console.log(
    `[asanaClient] created task "${task.title}" (local id ${task.id}) ` +
      `remotely as ${created.gid} in project ${board.integrationBoardId}`
  );
  return String(created.gid);
}

/**
 * Pushes a task edit to the external system. Task gids are workspace-global
 * in Asana, so the task addresses itself by integrationTaskId — no parent
 * needed. Asana's PUT only touches the fields sent, so unsynced attributes
 * (assignee, due date, ...) stay as they are remotely.
 */
async function updateTask(task) {
  const body = { name: task.title };
  if (task.description != null) {
    body.notes = task.description;
  }
  await request('PUT', `/tasks/${task.integrationTaskId}`, body);
  console.log(
    `[asanaClient] updated task "${task.title}" (local id ${task.id}) ` +
      `remotely as ${task.integrationTaskId}`
  );
}

/**
 * Creates the comment as a Story on its parent task's remote counterpart —
 * the handler passes the task in so the client stays DB-free.
 */
async function createComment(comment, task) {
  const created = await request(
    'POST',
    `/tasks/${task.integrationTaskId}/stories`,
    { text: comment.content }
  );
  console.log(
    `[asanaClient] created comment (local id ${comment.id}) ` +
      `remotely as story ${created.gid} on task ${task.integrationTaskId}`
  );
  return String(created.gid);
}

/**
 * Pushes a comment edit to the external system. Story gids are global in
 * Asana, so the comment addresses itself by integrationCommentId — no parent
 * needed. Only comment-type stories accept text updates, which is all this
 * client ever creates.
 */
async function updateComment(comment) {
  await request('PUT', `/stories/${comment.integrationCommentId}`, {
    text: comment.content,
  });
  console.log(
    `[asanaClient] updated comment (local id ${comment.id}) ` +
      `remotely as story ${comment.integrationCommentId}`
  );
}

// ---------------------------------------------------------------------------
// Inbound reads — used by the webhook translator to enrich Asana's compact
// webhook events. These are NOT part of the cross-provider client contract
// (still the six methods above, resolved via selectIntegration); the inbound
// path is Asana-specific and imports this module directly.

/** Fetches a Project (the remote counterpart of a Board). */
async function getProject(projectGid) {
  return request('GET', `/projects/${projectGid}`);
}

/** Fetches a Task. `projects[0].gid` on the result locates the parent board. */
async function getTask(taskGid) {
  return request('GET', `/tasks/${taskGid}`);
}

/**
 * Fetches a Story. `resource_subtype` distinguishes user comments
 * ("comment_added") from system stories; `target.gid` is the parent task.
 */
async function getStory(storyGid) {
  return request('GET', `/stories/${storyGid}`);
}

module.exports = {
  createBoard,
  updateBoard,
  createTask,
  updateTask,
  createComment,
  updateComment,
  getProject,
  getTask,
  getStory,
  // For tooling that owns its own Asana calls (webhook registration script);
  // not for handlers, which stay behind the six-method contract.
  request,
};
