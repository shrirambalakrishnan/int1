'use strict';

/**
 * Auth strategy for providers that authenticate with an OAuth2 bearer token
 * that expires and must be refreshed (Basecamp is the first — issue #38). Same
 * surface as every strategy — `async getAuthHeaders()` — so a client can hold
 * it without knowing it's OAuth; the async-ness that TokenAuthStrategy never
 * needed is the whole point here, since producing a header may require a
 * network refresh.
 *
 * Like the other strategies this is **DB-free and provider-agnostic**: it is
 * handed the current token set plus two closures and never touches a model,
 * process.env, or a specific provider's token endpoint —
 *
 *   refresh({ refreshToken }) -> { accessToken, expiresAt, refreshToken? }
 *     Mints a fresh access token. The provider-specific call (which token URL,
 *     how the expiry is expressed) lives in this closure, built by the caller;
 *     it returns the already-normalized pieces. A provider that rotates the
 *     refresh token returns the new one too (Basecamp does not).
 *   persist({ accessToken, refreshToken, expiresAt }) -> void
 *     Saves the refreshed set so the next call doesn't refresh again. The DB
 *     write lives here, in the caller's closure — not in the strategy.
 *
 * Refresh is proactive: when the token is within `expirySkewMs` of expiry we
 * renew before using it. (Reactive refresh-on-401 is a follow-up — the shared
 * request() core only retries 429 today, so there is no 401 seam to hook yet.)
 */
class OAuth2AuthStrategy {
  /**
   * @param {object} options
   * @param {string} options.accessToken   current access token
   * @param {string} options.refreshToken  current refresh token
   * @param {Date}   options.expiresAt     when the access token expires
   * @param {(arg: {refreshToken: string}) => Promise<{accessToken: string, expiresAt: Date, refreshToken?: string}>} options.refresh
   * @param {(tokens: {accessToken: string, refreshToken: string, expiresAt: Date}) => Promise<void>} options.persist
   * @param {number} [options.expirySkewMs=60000] renew this long before expiry
   */
  constructor({
    accessToken,
    refreshToken,
    expiresAt,
    refresh,
    persist,
    expirySkewMs = 60_000,
  } = {}) {
    if (!accessToken || !refreshToken || !expiresAt) {
      throw new Error(
        'OAuth2AuthStrategy requires accessToken, refreshToken and expiresAt'
      );
    }
    if (typeof refresh !== 'function' || typeof persist !== 'function') {
      throw new Error(
        'OAuth2AuthStrategy requires refresh and persist functions'
      );
    }
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    this.expiresAt = new Date(expiresAt);
    this.refresh = refresh;
    this.persist = persist;
    this.expirySkewMs = expirySkewMs;
  }

  isExpired() {
    return Date.now() >= this.expiresAt.getTime() - this.expirySkewMs;
  }

  async getAuthHeaders() {
    if (this.isExpired()) {
      const next = await this.refresh({ refreshToken: this.refreshToken });
      this.accessToken = next.accessToken;
      if (next.refreshToken) {
        this.refreshToken = next.refreshToken;
      }
      this.expiresAt = new Date(next.expiresAt);
      await this.persist({
        accessToken: this.accessToken,
        refreshToken: this.refreshToken,
        expiresAt: this.expiresAt,
      });
    }
    return { Authorization: `Bearer ${this.accessToken}` };
  }
}

module.exports = { OAuth2AuthStrategy };
