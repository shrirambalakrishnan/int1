'use strict';

/**
 * Auth strategy for providers that authenticate with a static API token
 * (ClickUp personal token, Linear API key, ...). A strategy owns *how* a
 * request proves identity; integration clients own *which* requests to make.
 *
 * Every strategy exposes the same surface — `async getAuthHeaders()` — so a
 * client can hold any strategy without knowing its kind. It is async even
 * though this strategy doesn't need it: future strategies (OAuth token
 * refresh) need IO to produce a header, and the interface has to fit them.
 */
class TokenAuthStrategy {
  /**
   * @param {object} options
   * @param {string} options.token - the secret token value. The caller reads
   *   it from the environment; this module never touches process.env, so the
   *   strategy stays reusable across providers and testable without env setup.
   * @param {string} [options.headerName='Authorization']
   * @param {string} [options.scheme=''] - e.g. 'Bearer'. Empty by default:
   *   ClickUp personal tokens are sent bare, with no scheme prefix.
   */
  constructor({ token, headerName = 'Authorization', scheme = '' } = {}) {
    if (!token) {
      throw new Error('TokenAuthStrategy requires a non-empty token');
    }
    this.token = token;
    this.headerName = headerName;
    this.scheme = scheme;
  }

  async getAuthHeaders() {
    const value = this.scheme ? `${this.scheme} ${this.token}` : this.token;
    return { [this.headerName]: value };
  }
}

module.exports = { TokenAuthStrategy };
