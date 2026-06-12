'use strict';

const clickupClient = require('../clients/clickupClient');
const { buildEvent } = require('../events');

/**
 * Translates a verified ClickUp webhook delivery into one canonical External*
 * event (validated by buildEvent), or null for event types we don't handle —
 * the receiver acks those with a 200 so subscribing to more ClickUp events
 * later can never break the endpoint.
 *
 * ClickUp payloads are thin ({ event, list_id|task_id, history_items }), so
 * translation fetches the full entity from the API. This module is the
 * provider-specific half of inbound sync; the External* handlers it feeds are
 * provider agnostic and never call a provider API.
 */

/**
 * The acting user, from the delivery's history_items. ClickUp ids are numbers
 * on the wire but opaque strings to us (same rule as every external id).
 */
function actorFrom(body) {
  const user = body.history_items?.[0]?.user;
  if (!user?.id) {
    return null;
  }
  return {
    externalUserId: String(user.id),
    username: user.username ?? null,
    email: user.email ?? null,
  };
}

async function translateListEvent(type, body, integrationId) {
  const list = await clickupClient.getList(body.list_id);
  return buildEvent(type, {
    integrationId,
    externalBoardId: String(list.id),
    name: list.name,
    actor: actorFrom(body),
  });
}

async function translateTaskEvent(type, body, integrationId) {
  const task = await clickupClient.getTask(body.task_id);
  const payload = {
    integrationId,
    externalTaskId: String(task.id),
    title: task.name,
    description: task.description || null,
    actor: actorFrom(body),
  };
  if (type === 'ExternalTaskCreated') {
    payload.externalBoardId = String(task.list.id);
  }
  return buildEvent(type, payload);
}

async function translateCommentEvent(type, body, integrationId) {
  // The comment id rides in history_items; the content is fetched rather than
  // trusted from the (undocumented) history_items shape.
  const externalCommentId = String(body.history_items?.[0]?.comment?.id ?? '');
  if (!externalCommentId) {
    console.warn(
      `[clickupWebhookTranslator] ${body.event} without a comment id in ` +
        `history_items; ignoring`
    );
    return null;
  }

  const comments = await clickupClient.getTaskComments(body.task_id);
  const comment = comments.find((c) => String(c.id) === externalCommentId);
  if (!comment) {
    // Deleted (or never visible) between the webhook firing and this fetch.
    console.warn(
      `[clickupWebhookTranslator] comment ${externalCommentId} not found on ` +
        `task ${body.task_id}; ignoring`
    );
    return null;
  }

  const payload = {
    integrationId,
    externalCommentId,
    content: comment.comment_text,
    actor: actorFrom(body),
  };
  if (type === 'ExternalCommentCreated') {
    payload.externalTaskId = String(body.task_id);
  }
  return buildEvent(type, payload);
}

// ClickUp event name -> canonical event type + translator.
const translators = {
  listCreated: (body, id) =>
    translateListEvent('ExternalBoardCreated', body, id),
  listUpdated: (body, id) =>
    translateListEvent('ExternalBoardUpdated', body, id),
  taskCreated: (body, id) =>
    translateTaskEvent('ExternalTaskCreated', body, id),
  taskUpdated: (body, id) =>
    translateTaskEvent('ExternalTaskUpdated', body, id),
  taskCommentPosted: (body, id) =>
    translateCommentEvent('ExternalCommentCreated', body, id),
  taskCommentUpdated: (body, id) =>
    translateCommentEvent('ExternalCommentUpdated', body, id),
};

async function translateClickupWebhook(body, integrationId) {
  const translate = translators[body.event];
  if (!translate) {
    console.log(
      `[clickupWebhookTranslator] no translation for event "${body.event}"; ignoring`
    );
    return null;
  }
  return translate(body, integrationId);
}

module.exports = { translateClickupWebhook };
