'use strict';

/**
 * Basecamp 4 OAuth2 endpoints + URL builders (issue #27).
 *
 * Basecamp is OAuth2-only and its flavour is OAuth2 *draft 5*: the authorize
 * and token URLs take a non-standard `type=web_server` param, there is no PKCE
 * and no discovery document. These launchpad URLs are provider constants — the
 * same "BASE_URL lives in the client" home as the other providers, just for the
 * OAuth side (the account-scoped API base, https://3.basecampapi.com/{id}, will
 * live in the Basecamp API client when that lands).
 *
 * This module is config-free on purpose: callers pass client id / redirect uri
 * in (read from .env at the edge), mirroring the DB-free strategy seam.
 */

const AUTHORIZE_URL = 'https://launchpad.37signals.com/authorization/new';
const TOKEN_URL = 'https://launchpad.37signals.com/authorization/token';
// Identity + account list — a separate call after the token exchange; the token
// endpoint returns only the tokens, not who/which account they belong to.
const IDENTITY_URL = 'https://launchpad.37signals.com/authorization.json';

/**
 * Build the Basecamp consent URL the admin is redirected to. The provider
 * sends the browser back to redirectUri with a `?code=` once access is granted.
 *
 * `state` (CSRF protection) is intentionally not included yet — it lands in
 * Task 8 (issue #27), where /connect mints it and /callback verifies it.
 */
function buildAuthorizeUrl({ clientId, redirectUri }) {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set('type', 'web_server'); // draft-5 quirk, not standard OAuth2
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  return url.toString();
}

module.exports = { AUTHORIZE_URL, TOKEN_URL, IDENTITY_URL, buildAuthorizeUrl };
