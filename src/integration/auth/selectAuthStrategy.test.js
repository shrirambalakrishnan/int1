'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');

const { selectAuthStrategy } = require('./selectAuthStrategy');
const { TokenAuthStrategy } = require('./tokenAuthStrategy');

describe('selectAuthStrategy', () => {
  it("constructs a TokenAuthStrategy for 'token' with the given options", async () => {
    const strategy = selectAuthStrategy('token', { token: 'pk_abc' });

    assert.ok(strategy instanceof TokenAuthStrategy);
    assert.deepStrictEqual(await strategy.getAuthHeaders(), {
      Authorization: 'pk_abc',
    });
  });

  it('throws for an unknown strategy name', () => {
    assert.throws(() => selectAuthStrategy('oauth', {}), /No auth strategy registered for: oauth/);
  });
});
