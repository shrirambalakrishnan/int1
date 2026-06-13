'use strict';

const trelloClient = require('../clients/trelloClient');
const { buildEvent } = require('../events');

/**
 * Translates a verified Trello webhook delivery into one canonical External*
 * event (validated by buildEvent), or null for action types we don't handle —
 * the receiver acks those with a 200. Trello fires a webhook on EVERY action on
 * the watched board (there is no registration-time event filter, unlike ClickUp
 * and Asana), so this action-type map is the only filter and unhandled actions
 * are the common case, not the exception.
 *
 * Each delivery is { model, action }; action.type is the discriminator. Trello
 * payloads carry the changed entity and the acting member inline, but the entity
 * is re-fetched for completeness (a createCard omits the desc; an updateCard
 * carries only the changed fields). The actor, by contrast, comes straight from
 * the payload — no fetch.
 *
 * This module is the provider-specific half of inbound sync; the External*
 * handlers it feeds are provider agnostic and never call a provider API.
 */

/**
 * The acting member, from the action envelope. Trello ids are 24-char hex
 * strings but opaque to us (same rule as every external id); the member carries
 * a username but Trello never exposes an email here.
 */
function actorFrom(action) {
  const id = action.idMemberCreator;
  if (!id) {
    return null;
  }
  return {
    externalUserId: String(id),
    username: action.memberCreator?.username ?? null,
    email: null,
  };
}

async function translateListEvent(type, action, integrationId) {
  const list = await trelloClient.getList(action.data.list.id);
  return buildEvent(type, {
    integrationId,
    externalBoardId: String(list.id),
    name: list.name,
    actor: actorFrom(action),
  });
}

async function translateCardEvent(type, action, integrationId) {
  const card = await trelloClient.getCard(action.data.card.id);
  const payload = {
    integrationId,
    externalTaskId: String(card.id),
    title: card.name,
    description: card.desc || null,
    actor: actorFrom(action),
  };
  if (type === 'ExternalTaskCreated') {
    payload.externalBoardId = String(card.idList);
  }
  return buildEvent(type, payload);
}

async function translateCommentEvent(type, action, integrationId) {
  // A Trello comment IS an Action. On commentCard the delivered action is the
  // comment itself (id = action.id); on updateComment it references the original
  // comment via data.action.id. Fetch by that id so the content is the current
  // text, not whatever the (sometimes partial) payload carried.
  const commentActionId =
    type === 'ExternalCommentCreated' ? action.id : action.data.action?.id;
  if (!commentActionId) {
    console.warn(
      `[trelloWebhookTranslator] ${action.type} without a comment action id; ignoring`
    );
    return null;
  }

  const commentAction = await trelloClient.getCommentAction(commentActionId);
  const payload = {
    integrationId,
    externalCommentId: String(commentAction.id),
    content: commentAction.data.text,
    actor: actorFrom(action),
  };
  if (type === 'ExternalCommentCreated') {
    payload.externalTaskId = String(commentAction.data.card.id);
  }
  return buildEvent(type, payload);
}

// Trello action type -> canonical event type + translator.
const translators = {
  createList: (action, id) =>
    translateListEvent('ExternalBoardCreated', action, id),
  updateList: (action, id) =>
    translateListEvent('ExternalBoardUpdated', action, id),
  createCard: (action, id) =>
    translateCardEvent('ExternalTaskCreated', action, id),
  updateCard: (action, id) =>
    translateCardEvent('ExternalTaskUpdated', action, id),
  commentCard: (action, id) =>
    translateCommentEvent('ExternalCommentCreated', action, id),
  updateComment: (action, id) =>
    translateCommentEvent('ExternalCommentUpdated', action, id),
};

async function translateTrelloWebhook(body, integrationId) {
  const action = body.action;
  const translate = action && translators[action.type];
  if (!translate) {
    console.log(
      `[trelloWebhookTranslator] no translation for action "${action?.type}"; ignoring`
    );
    return null;
  }
  return translate(action, integrationId);
}

module.exports = { translateTrelloWebhook };
