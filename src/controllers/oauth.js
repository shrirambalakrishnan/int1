'use strict';

const { buildAuthorizeUrl } = require('../integration/oauth/basecamp');
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

module.exports = { connectBasecamp };
