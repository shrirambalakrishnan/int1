'use strict';

const stubClient = require('./clients/stubClient');

/**
 * Resolves an integrationId to the client that knows how to talk to that
 * external system. This is the single place where the `integrationId -> client`
 * mapping lives.
 *
 * For now every integration resolves to the stub client. When real providers
 * arrive this is the only function that changes — call sites stay the same —
 * and it can grow into a proper registry (clients self-registering / config
 * driven) without touching the handlers.
 */
function selectIntegration(integrationId) {
  return stubClient;
}

module.exports = { selectIntegration };
