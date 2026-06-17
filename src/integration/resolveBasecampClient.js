'use strict';

const { IntegrationUser, IntegrationUserOAuthData } = require('../models');
const { selectAuthStrategy } = require('./auth/selectAuthStrategy');
const { createBasecampClient } = require('./clients/basecampClient');
const { refreshTokens } = require('./oauth/basecamp');

/**
 * The wiring edge that turns the Basecamp integration into a ready, connection-
 * bound client (issue #38). This is where the DB and process.env live, kept out
 * of the DB-free client and strategy:
 *
 *   - load the connected actor's stored OAuth token set (access/refresh/expiry
 *     + account id) from IntegrationUserOAuthData,
 *   - build the provider-specific refresh + persist closures and the `oauth2`
 *     strategy over them,
 *   - hand the account id, pinned project, and strategy to createBasecampClient.
 *
 * selectIntegration delegates here for name === 'basecamp', so the handlers and
 * the six-method client contract stay untouched (Option A on issue #38). It
 * stands in for the "caller loads the token and passes it plus a persist hook"
 * seam described in CLAUDE.md — one layer out from the handler, which is what
 * keeps the provider-agnostic handlers from having to know about OAuth.
 *
 * Single-tenant: exactly one connected actor is expected. Zero -> the admin
 * hasn't run /oauth/basecamp/connect yet; more than one -> multi-tenant actor
 * selection isn't built, so we refuse loudly rather than sync as a random user.
 */
async function resolveBasecampClient(integration) {
  const clientId = process.env.BASECAMP_CLIENT_ID;
  const clientSecret = process.env.BASECAMP_CLIENT_SECRET;
  const projectId = process.env.BASECAMP_PROJECT_ID;
  if (!clientId || !clientSecret || !projectId) {
    throw new Error(
      '[resolveBasecampClient] BASECAMP_CLIENT_ID, BASECAMP_CLIENT_SECRET and ' +
        'BASECAMP_PROJECT_ID must be set'
    );
  }

  const connections = await IntegrationUserOAuthData.findAll({
    include: [
      {
        model: IntegrationUser,
        as: 'integrationUser',
        where: { integrationId: integration.id },
        required: true,
      },
    ],
  });
  if (connections.length === 0) {
    throw new Error(
      '[resolveBasecampClient] no connected Basecamp user; run ' +
        '/oauth/basecamp/connect first'
    );
  }
  if (connections.length > 1) {
    throw new Error(
      '[resolveBasecampClient] multiple connected Basecamp users; ' +
        'multi-tenant actor selection is not supported yet'
    );
  }
  const oauthData = connections[0];

  // Provider-specific refresh: call launchpad, normalize expires_in (seconds)
  // into an absolute expiresAt. Stays out of the strategy, which is generic.
  const refresh = async ({ refreshToken }) => {
    const { accessToken, expiresIn } = await refreshTokens({
      refreshToken,
      clientId,
      clientSecret,
    });
    return { accessToken, expiresAt: new Date(Date.now() + expiresIn * 1000) };
  };
  // Persist the refreshed token set so the next event doesn't refresh again.
  // Basecamp doesn't rotate the refresh token, so only access + expiry change.
  const persist = async ({ accessToken, expiresAt }) =>
    oauthData.update({ accessToken, expiresAt });

  const authStrategy = selectAuthStrategy('oauth2', {
    accessToken: oauthData.accessToken,
    refreshToken: oauthData.refreshToken,
    expiresAt: oauthData.expiresAt,
    refresh,
    persist,
  });

  return createBasecampClient({
    accountId: oauthData.accountId,
    projectId,
    todosetId: process.env.BASECAMP_TODOSET_ID, // optional; skips the dock lookup
    authStrategy,
  });
}

module.exports = { resolveBasecampClient };
