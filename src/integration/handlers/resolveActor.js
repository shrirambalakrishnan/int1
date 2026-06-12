'use strict';

const { IntegrationUser } = require('../../models');

/**
 * Resolves an inbound event's actor ({ externalUserId, username, email }) to
 * an IntegrationUser row id, creating the row on first sight — external users
 * materialize automatically on an integration call, they are never registered
 * up front. Backed by the unique (integrationId, externalUserId) index.
 *
 * Returns null when the provider sent no actor, so callers can pass the result
 * straight into createdByIntegrationUserId (nullable by design).
 */
async function resolveActor(integrationId, actor) {
  if (!actor) {
    return null;
  }

  const [integrationUser] = await IntegrationUser.findOrCreate({
    where: { integrationId, externalUserId: actor.externalUserId },
    defaults: {
      integrationUserName: actor.username ?? null,
      integrationUserEmail: actor.email ?? null,
    },
  });

  return integrationUser.id;
}

module.exports = { resolveActor };
