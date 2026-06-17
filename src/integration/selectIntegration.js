'use strict';

const { Integration } = require('../models');
const stubClient = require('./clients/stubClient');
const clickupClient = require('./clients/clickupClient');
const asanaClient = require('./clients/asanaClient');
const trelloClient = require('./clients/trelloClient');
const { resolveBasecampClient } = require('./resolveBasecampClient');

/**
 * Resolves an integrationId to the client that knows how to talk to that
 * external system. This is the single place where the `integration -> client`
 * mapping lives.
 *
 * The Integration row's name keys the registry (async because that's a DB
 * lookup). Anything unregistered falls back to the stub client, which keeps
 * dev/test integrations working without a real provider behind them.
 *
 * Basecamp is the exception to the static-singleton registry: its client is
 * connection-bound (account-scoped base URL + per-user OAuth token from the
 * DB), so it's built per call by resolveBasecampClient rather than looked up.
 */
const clients = {
  clickup: clickupClient,
  asana: asanaClient,
  trello: trelloClient,
};

async function selectIntegration(integrationId) {
  const integration = await Integration.findByPk(integrationId);
  const name = integration?.name?.toLowerCase();
  if (name === 'basecamp') {
    return resolveBasecampClient(integration);
  }
  return clients[name] || stubClient;
}

module.exports = { selectIntegration };
