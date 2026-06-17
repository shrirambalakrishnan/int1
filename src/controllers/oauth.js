'use strict';

const {
  buildAuthorizeUrl,
  exchangeCodeForTokens,
  fetchIdentity,
} = require('../integration/oauth/basecamp');
const {
  Integration,
  IntegrationUser,
  IntegrationUserOAuthData,
} = require('../models');
const { sendError } = require('../utils/errors');

/**
 * Step 1 of the Basecamp authorization-code flow (issue #27, Task 5): hand the
 * admin the consent URL. They open it, log into Basecamp and grant int1 access;
 * Basecamp then redirects to BASECAMP_REDIRECT_URI with a `?code=` that the
 * callback route (Task 6) exchanges for tokens.
 *
 * Config is read lazily, per request, like the API clients: BASECAMP_CLIENT_ID
 * and BASECAMP_REDIRECT_URI come from .env (non-secret); the client *secret*
 * lives in the Keychain and is only needed at the token-exchange step, not here.
 */
async function connectBasecamp(req, res, next) {
  try {
    const clientId = process.env.BASECAMP_CLIENT_ID;
    const redirectUri = process.env.BASECAMP_REDIRECT_URI;
    if (!clientId || !redirectUri) {
      throw new Error(
        '[oauth] BASECAMP_CLIENT_ID and BASECAMP_REDIRECT_URI must be set'
      );
    }
    const url = buildAuthorizeUrl({ clientId, redirectUri });
    res.json({ url });
  } catch (err) {
    sendError(res, next, err);
  }
}

/**
 * Step 2 of the flow (issue #27, Task 6): Basecamp redirects the browser back
 * here after consent with `?code=`. We exchange the code for tokens (back
 * channel, with the client secret), look up who authorized, and persist:
 *   - upsert the IntegrationUser keyed by (basecamp integration, identity id)
 *   - store/refresh its single OAuth token row
 *
 * Idempotent on re-auth: the IntegrationUser is found-or-created and the token
 * row is overwritten (1:1 unique index on integrationUserId), so hitting the
 * flow again just rotates the stored tokens.
 *
 * Deferred: `state` (CSRF) verification lands in Task 8 — once /connect mints a
 * state, this handler must verify req.query.state before trusting the code.
 */
async function callbackBasecamp(req, res, next) {
  try {
    // User declined consent (or Basecamp errored): no code, an `error` param
    // instead. Nothing to persist — surface it as a 400.
    if (req.query.error) {
      return res
        .status(400)
        .json({ error: `Basecamp authorization failed: ${req.query.error}` });
    }
    const code = req.query.code;
    if (!code) {
      return res.status(400).json({ error: 'Missing authorization code' });
    }

    const clientId = process.env.BASECAMP_CLIENT_ID;
    const redirectUri = process.env.BASECAMP_REDIRECT_URI;
    const clientSecret = process.env.BASECAMP_CLIENT_SECRET;
    if (!clientId || !redirectUri || !clientSecret) {
      throw new Error(
        '[oauth] BASECAMP_CLIENT_ID, BASECAMP_REDIRECT_URI and ' +
          'BASECAMP_CLIENT_SECRET must be set'
      );
    }

    const tokens = await exchangeCodeForTokens({
      code,
      clientId,
      clientSecret,
      redirectUri,
    });
    const identity = await fetchIdentity(tokens.accessToken);

    const integration = await Integration.findOne({
      where: { name: 'basecamp' },
    });
    if (!integration) {
      // The reference-data migration should have seeded this row.
      throw new Error('[oauth] basecamp Integration row is missing');
    }

    // Upsert the actor by its Basecamp identity (not the account) — same
    // findOrCreate idiom as resolveActor, backed by the
    // (integrationId, externalUserId) unique index.
    const [integrationUser] = await IntegrationUser.findOrCreate({
      where: {
        integrationId: integration.id,
        externalUserId: identity.externalUserId,
      },
      defaults: {
        integrationUserName: identity.name,
        integrationUserEmail: identity.email,
      },
    });

    const oauthValues = {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
      accountId: identity.accountId,
    };
    // 1:1 with the actor — create on first connect, overwrite on re-auth.
    const [oauthData, created] = await IntegrationUserOAuthData.findOrCreate({
      where: { integrationUserId: integrationUser.id },
      defaults: oauthValues,
    });
    if (!created) {
      await oauthData.update(oauthValues);
    }

    // Never echo the tokens back through the browser — just confirm the link.
    res.json({
      status: 'connected',
      integrationUserId: integrationUser.id,
      externalUserId: identity.externalUserId,
      accountId: identity.accountId,
    });
  } catch (err) {
    sendError(res, next, err);
  }
}

module.exports = { connectBasecamp, callbackBasecamp };
