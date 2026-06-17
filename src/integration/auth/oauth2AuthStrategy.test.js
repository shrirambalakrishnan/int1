'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');

const { OAuth2AuthStrategy } = require('./oauth2AuthStrategy');

const inAnHour = () => new Date(Date.now() + 3_600_000);
const ago = () => new Date(Date.now() - 1_000);

const noop = async () => {};
const base = (overrides = {}) => ({
  accessToken: 'at',
  refreshToken: 'rt',
  expiresAt: inAnHour(),
  refresh: async () => {
    throw new Error('refresh should not be called');
  },
  persist: noop,
  ...overrides,
});

describe('OAuth2AuthStrategy', () => {
  it('returns a Bearer header from the current token when not near expiry', async () => {
    const strategy = new OAuth2AuthStrategy(base());

    assert.deepStrictEqual(await strategy.getAuthHeaders(), {
      Authorization: 'Bearer at',
    });
  });

  it('refreshes and persists when the token is within the expiry skew', async () => {
    const persisted = [];
    const newExpiry = inAnHour();
    const strategy = new OAuth2AuthStrategy(
      base({
        expiresAt: ago(),
        refresh: async ({ refreshToken }) => {
          assert.strictEqual(refreshToken, 'rt');
          return { accessToken: 'fresh', expiresAt: newExpiry };
        },
        persist: async (tokens) => persisted.push(tokens),
      })
    );

    assert.deepStrictEqual(await strategy.getAuthHeaders(), {
      Authorization: 'Bearer fresh',
    });
    assert.strictEqual(persisted.length, 1);
    assert.strictEqual(persisted[0].accessToken, 'fresh');
    assert.strictEqual(persisted[0].refreshToken, 'rt'); // unrotated
    assert.deepStrictEqual(persisted[0].expiresAt, newExpiry);
  });

  it('adopts a rotated refresh token when the provider returns one', async () => {
    const persisted = [];
    const strategy = new OAuth2AuthStrategy(
      base({
        expiresAt: ago(),
        refresh: async () => ({
          accessToken: 'fresh',
          refreshToken: 'rotated',
          expiresAt: inAnHour(),
        }),
        persist: async (tokens) => persisted.push(tokens),
      })
    );

    await strategy.getAuthHeaders();
    assert.strictEqual(persisted[0].refreshToken, 'rotated');
  });

  it('does not refresh again once renewed', async () => {
    let refreshCount = 0;
    const strategy = new OAuth2AuthStrategy(
      base({
        expiresAt: ago(),
        refresh: async () => {
          refreshCount += 1;
          return { accessToken: 'fresh', expiresAt: inAnHour() };
        },
        persist: noop,
      })
    );

    await strategy.getAuthHeaders();
    await strategy.getAuthHeaders();
    assert.strictEqual(refreshCount, 1);
  });

  it('throws when required tokens or closures are missing', () => {
    assert.throws(() => new OAuth2AuthStrategy(), /requires accessToken/);
    assert.throws(
      () => new OAuth2AuthStrategy({ accessToken: 'a', refreshToken: 'r', expiresAt: inAnHour() }),
      /requires refresh and persist/
    );
  });
});
