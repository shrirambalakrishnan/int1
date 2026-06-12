'use strict';

const asanaClient = require('../clients/asanaClient');
const { buildEvent } = require('../events');

/**
 * Translates one event from a verified Asana webhook delivery into a canonical
 * External* event (validated by buildEvent), or null for (resource, action)
 * pairs we don't handle — the receiver acks those with a 200 so widening the
 * webhook filters later can never break the endpoint.
 *
 * Asana deliveries are batches ({ events: [...] }); the controller loops and
 * calls this once per event. Events are compact ({ user, resource, action,
 * parent }), so translation fetches the full entity from the API.
 *
 * The webhook is registered per project (workspace webhooks can't carry task
 * or story events), so ExternalBoardCreated never arrives from Asana — a
 * webhook on a project cannot observe that project's own creation.
 */

/**
 * The acting user. Compact events carry only the gid; name/email enrichment
 * is left to resolveActor's null handling (same fields ClickUp can omit).
 */
function actorFrom(event) {
  const gid = event.user?.gid;
  if (!gid) {
    return null;
  }
  return { externalUserId: String(gid), username: null, email: null };
}

async function translateProjectChanged(event, integrationId) {
  const project = await asanaClient.getProject(event.resource.gid);
  return buildEvent('ExternalBoardUpdated', {
    integrationId,
    externalBoardId: String(project.gid),
    name: project.name,
    actor: actorFrom(event),
  });
}

async function translateTaskEvent(type, event, integrationId) {
  const task = await asanaClient.getTask(event.resource.gid);
  const payload = {
    integrationId,
    externalTaskId: String(task.gid),
    title: task.name,
    description: task.notes || null,
    actor: actorFrom(event),
  };
  if (type === 'ExternalTaskCreated') {
    const projectGid = task.projects?.[0]?.gid;
    if (!projectGid) {
      // Already moved out of every project (or never landed in one); there is
      // no parent board to attach it to.
      console.warn(
        `[asanaWebhookTranslator] task ${task.gid} has no project; ignoring`
      );
      return null;
    }
    payload.externalBoardId = String(projectGid);
  }
  return buildEvent(type, payload);
}

async function translateStoryEvent(type, event, integrationId) {
  // Only user comments sync. Every other story is a system entry ("X added
  // the task to Y"), distinguishable by subtype without an API call.
  if (event.resource.resource_subtype !== 'comment_added') {
    return null;
  }

  const story = await asanaClient.getStory(event.resource.gid);
  const payload = {
    integrationId,
    externalCommentId: String(story.gid),
    content: story.text,
    actor: actorFrom(event),
  };
  if (type === 'ExternalCommentCreated') {
    payload.externalTaskId = String(story.target.gid);
  }
  return buildEvent(type, payload);
}

// (resource_type, action) -> canonical event type + translator.
const translators = {
  'project:changed': (event, id) => translateProjectChanged(event, id),
  'task:added': (event, id) =>
    translateTaskEvent('ExternalTaskCreated', event, id),
  'task:changed': (event, id) =>
    translateTaskEvent('ExternalTaskUpdated', event, id),
  'story:added': (event, id) =>
    translateStoryEvent('ExternalCommentCreated', event, id),
  'story:changed': (event, id) =>
    translateStoryEvent('ExternalCommentUpdated', event, id),
};

async function translateAsanaWebhookEvent(event, integrationId) {
  const key = `${event.resource?.resource_type}:${event.action}`;
  const translate = translators[key];
  if (!translate) {
    console.log(
      `[asanaWebhookTranslator] no translation for "${key}"; ignoring`
    );
    return null;
  }
  return translate(event, integrationId);
}

module.exports = { translateAsanaWebhookEvent };
