'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');

const { TokenAuthStrategy } = require('./tokenAuthStrategy');

describe('TokenAuthStrategy', () => {
  it('sends the bare token in the Authorization header by default', async () => {
    const strategy = new TokenAuthStrategy({ token: 'pk_123_ABC' });

    assert.deepStrictEqual(await strategy.getAuthHeaders(), {
      Authorization: 'pk_123_ABC',
    });
  });

  it('prefixes the token with the scheme when one is given', async () => {
    const strategy = new TokenAuthStrategy({ token: 'tok', scheme: 'Bearer' });

    assert.deepStrictEqual(await strategy.getAuthHeaders(), {
      Authorization: 'Bearer tok',
    });
  });

  it('supports a custom header name', async () => {
    const strategy = new TokenAuthStrategy({ token: 'tok', headerName: 'X-Api-Key' });

    assert.deepStrictEqual(await strategy.getAuthHeaders(), {
      'X-Api-Key': 'tok',
    });
  });

  it('throws on construction when the token is missing or empty', () => {
    assert.throws(() => new TokenAuthStrategy(), /non-empty token/);
    assert.throws(() => new TokenAuthStrategy({}), /non-empty token/);
    assert.throws(() => new TokenAuthStrategy({ token: '' }), /non-empty token/);
  });
});
