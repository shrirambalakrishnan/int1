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

// Basecamp *requires* a User-Agent on every request (missing → 400) containing
// the app name plus a contact (a link or email). localhost is fine for local
// single-tenant dev; swap in a reachable link/email before any non-local use.
// https://github.com/basecamp/bc3-api#identifying-your-application
const USER_AGENT = 'int1 (http://localhost:3000)';

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

/**
 * Step 2 (back channel): swap the authorization code for tokens. Basecamp's
 * draft-5 token call is non-standard — `type=web_server` and all params go in
 * the *query string* of a bodyless POST (not a form-encoded body). The
 * client_secret travels here, server-to-server, never through the browser.
 *
 * Returns the renamed token set; the response is
 * { access_token, expires_in (seconds), refresh_token }.
 */
async function exchangeCodeForTokens({ code, clientId, clientSecret, redirectUri }) {
  const url = new URL(TOKEN_URL);
  url.searchParams.set('type', 'web_server');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('client_secret', clientSecret);
  url.searchParams.set('code', code);

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'User-Agent': USER_AGENT },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`[basecampOAuth] token exchange failed (${res.status}): ${text}`);
  }
  const data = JSON.parse(text);
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in, // seconds (Basecamp access tokens last ~2 weeks)
  };
}

/**
 * Step 3: find out who/what the freshly minted token belongs to. The token
 * endpoint returns only the tokens, so identity + account come from a separate
 * authenticated call. Returns the normalized pieces we persist:
 *
 *   externalUserId — the Basecamp *identity* (the person). This keys the
 *     IntegrationUser, per the single-tenant guardrail (CLAUDE.md): keyed to an
 *     actor, never a global blob, so multi-tenant is just more rows.
 *   accountId      — the Basecamp *account* (the workspace), a distinct value
 *     used to scope every API call (https://3.basecampapi.com/{accountId}/...).
 *     Single-tenant: pick the first Basecamp 4 ("bc3") account.
 *
 * identity.id and account.id are opaque external ids — kept as strings, never
 * parseInt (CLAUDE.md).
 */
async function fetchIdentity(accessToken) {
  const res = await fetch(IDENTITY_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'User-Agent': USER_AGENT,
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`[basecampOAuth] identity fetch failed (${res.status}): ${text}`);
  }
  const data = JSON.parse(text);
  const identity = data.identity;
  const account =
    (data.accounts || []).find((a) => a.product === 'bc3') ||
    (data.accounts || [])[0];
  if (!identity || !account) {
    throw new Error('[basecampOAuth] authorization.json missing identity or accounts');
  }
  return {
    externalUserId: String(identity.id),
    name:
      [identity.first_name, identity.last_name].filter(Boolean).join(' ') ||
      null,
    email: identity.email_address ?? null,
    accountId: String(account.id),
  };
}

module.exports = {
  AUTHORIZE_URL,
  TOKEN_URL,
  IDENTITY_URL,
  buildAuthorizeUrl,
  exchangeCodeForTokens,
  fetchIdentity,
};
