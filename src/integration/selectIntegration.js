'use strict';

const { Integration } = require('../models');
const stubClient = require('./clients/stubClient');
const clickupClient = require('./clients/clickupClient');

/**
 * Resolves an integrationId to the client that knows how to talk to that
 * external system. This is the single place where the `integration -> client`
 * mapping lives.
 *
 * The Integration row's name keys the registry (async because that's a DB
 * lookup). Anything unregistered falls back to the stub client, which keeps
 * dev/test integrations working without a real provider behind them.
 */
const clients = {
  clickup: clickupClient,
};

async function selectIntegration(integrationId) {
  const integration = await Integration.findByPk(integrationId);
  const name = integration?.name?.toLowerCase();
  return clients[name] || stubClient;
}

module.exports = { selectIntegration };
