'use strict';

const { createRequest } = require('./request');
const { USER_AGENT } = require('../oauth/basecamp');

/**
 * Basecamp 4 integration client (the BC3 API). Same six-method surface as the
 * other clients so selectIntegration can hand it to the handlers — but unlike
 * them it is **connection-bound, not a module singleton**: Basecamp's API base
 * is account-scoped (https://3.basecampapi.com/{accountId}) and its token lives
 * per-IntegrationUser in the DB, so the wiring edge (resolveBasecampClient)
 * loads both and constructs one of these per call. The client itself stays
 * DB-free — it's handed the accountId, the pinned project, and a ready
 * (OAuth2) auth strategy.
 *
 * Mapping (parallels ClickUp's Space -> List -> Task -> Comment):
 *   project (BASECAMP_PROJECT_ID, pinned)  the workspace we sync into
 *     todoset (1 per project, resolved from its dock)
 *       Board   -> to-do list
 *         Task  -> to-do (a "recording")
 *           Comment -> comment on the to-do
 *
 * Basecamp constants live here, the same "BASE_URL in the client" home as the
 * other providers; the OAuth launchpad URLs live in oauth/basecamp.js.
 */
const API_ROOT = 'https://3.basecampapi.com';

function createBasecampClient({
  accountId,
  projectId,
  todosetId,
  authStrategy,
}) {
  const request = createRequest({
    name: 'basecampClient',
    baseUrl: `${API_ROOT}/${accountId}`,
    authStrategy: () => authStrategy,
    // 50 requests / 10s; on 429 Basecamp sends Retry-After (seconds).
    retryDelayMs: (res) => Number(res.headers.get('retry-after')) * 1000,
    // Basecamp errors are usually { error: "..." }; fall back to the raw body
    // for the occasional plain-text/empty one.
    errorMessage: (json, text) => json.error || text,
    // Basecamp rejects any request without a User-Agent (400). It carries no
    // auth, so it rides as a default header rather than through the strategy.
    defaultHeaders: { 'User-Agent': USER_AGENT },
  });

  // To-do lists are created inside the project's todoset. Its id isn't config —
  // it's read from the project's dock once and cached for this client's life
  // (or supplied directly via BASECAMP_TODOSET_ID to skip the lookup).
  let cachedTodosetId = todosetId || null;
  async function resolveTodosetId() {
    if (cachedTodosetId) {
      return cachedTodosetId;
    }
    const project = await request('GET', `/projects/${projectId}.json`);
    const todoset = (project.dock || []).find((d) => d.name === 'todoset');
    if (!todoset) {
      throw new Error(
        `[basecampClient] project ${projectId} has no todoset in its dock`
      );
    }
    cachedTodosetId = String(todoset.id);
    return cachedTodosetId;
  }

  /**
   * Creates the board as a to-do list in the pinned project's todoset. Basecamp
   * ids are large numbers; return as a string for integrationBoardId.
   */
  async function createBoard(board) {
    const setId = await resolveTodosetId();
    const list = await request('POST', `/todosets/${setId}/todolists.json`, {
      name: board.name,
    });
    console.log(
      `[basecampClient] created board "${board.name}" (local id ${board.id}) ` +
        `remotely as todolist ${list.id}`
    );
    return String(list.id);
  }

  /**
   * Pushes a board rename. The to-do list is addressed by integrationBoardId.
   * Name is the only Board attribute int1 owns.
   */
  async function updateBoard(board) {
    await request('PUT', `/todolists/${board.integrationBoardId}.json`, {
      name: board.name,
    });
    console.log(
      `[basecampClient] updated board "${board.name}" (local id ${board.id}) ` +
        `remotely as todolist ${board.integrationBoardId}`
    );
  }

  /**
   * Creates the task as a to-do in its parent board's list — the handler passes
   * the board in so the client stays DB-free. `content` is the to-do title;
   * description is sent only when set, as the other clients do on create.
   */
  async function createTask(task, board) {
    const body = { content: task.title };
    if (task.description != null) {
      body.description = task.description;
    }
    const created = await request(
      'POST',
      `/todolists/${board.integrationBoardId}/todos.json`,
      body
    );
    console.log(
      `[basecampClient] created task "${task.title}" (local id ${task.id}) ` +
        `remotely as todo ${created.id} in todolist ${board.integrationBoardId}`
    );
    return String(created.id);
  }

  /**
   * Pushes a task edit. To-dos are addressed by integrationTaskId. Quirk:
   * unlike ClickUp/Asana, Basecamp's PUT *clears* any param it isn't sent — so
   * both content and description go on every update (empty string when int1 has
   * no description), reflecting int1's state rather than leaving stale text.
   */
  async function updateTask(task) {
    await request('PUT', `/todos/${task.integrationTaskId}.json`, {
      content: task.title,
      description: task.description ?? '',
    });
    console.log(
      `[basecampClient] updated task "${task.title}" (local id ${task.id}) ` +
        `remotely as todo ${task.integrationTaskId}`
    );
  }

  /**
   * Creates the comment on its parent task's to-do — the handler passes the
   * task in so the client stays DB-free. Comments hang off any "recording", and
   * a to-do is one, so it's addressed by integrationTaskId.
   */
  async function createComment(comment, task) {
    const created = await request(
      'POST',
      `/recordings/${task.integrationTaskId}/comments.json`,
      { content: comment.content }
    );
    console.log(
      `[basecampClient] created comment (local id ${comment.id}) ` +
        `remotely as ${created.id} on todo ${task.integrationTaskId}`
    );
    return String(created.id);
  }

  /**
   * Pushes a comment edit. Comments are addressed by integrationCommentId.
   * `content` is the only field, so the PUT-clobber quirk doesn't bite here.
   */
  async function updateComment(comment) {
    await request('PUT', `/comments/${comment.integrationCommentId}.json`, {
      content: comment.content,
    });
    console.log(
      `[basecampClient] updated comment (local id ${comment.id}) ` +
        `remotely as ${comment.integrationCommentId}`
    );
  }

  return {
    createBoard,
    updateBoard,
    createTask,
    updateTask,
    createComment,
    updateComment,
  };
}

module.exports = { createBasecampClient };
