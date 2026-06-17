'use strict';

const { TokenAuthStrategy } = require('./tokenAuthStrategy');
const { OAuth2AuthStrategy } = require('./oauth2AuthStrategy');

/**
 * Resolves a strategy name to a constructed auth strategy. This is the single
 * place where the `name -> strategy` mapping lives, mirroring what
 * selectIntegration does for clients.
 *
 * Each integration client picks its strategy here at construction time
 * ('token' for ClickUp/Asana/Trello, 'oauth2' for Basecamp). Adding a provider
 * with a new auth kind grows this by one entry; call sites stay the same.
 */
const strategies = {
  token: (options) => new TokenAuthStrategy(options),
  oauth2: (options) => new OAuth2AuthStrategy(options),
};

function selectAuthStrategy(name, options) {
  const factory = strategies[name];
  if (!factory) {
    throw new Error(`No auth strategy registered for: ${name}`);
  }
  return factory(options);
}

module.exports = { selectAuthStrategy };
