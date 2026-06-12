'use strict';

const { describe, it, mock, afterEach } = require('node:test');
const assert = require('node:assert');

const { createRequest } = require('./request');

// Minimal stand-in for a fetch Response; only what the core touches.
const fakeRes = ({ status = 200, body = '{}', headers = {} } = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (name) => headers[name.toLowerCase()] ?? null },
  text: async () => body,
});

// A vanilla provider descriptor; tests override the hook under test.
const descriptor = (overrides = {}) => ({
  name: 'testClient',
  baseUrl: 'https://api.example.test/1',
  authStrategy: () => ({
    getAuthHeaders: async () => ({ Authorization: 'Token tok' }),
  }),
  retryDelayMs: () => 1_000,
  errorMessage: (json, text) => json.message || text,
  ...overrides,
});

// Drains the microtask queue so a pending request() reaches its 429 sleep
// before the test ticks the mocked clock past it.
const settle = () => new Promise((resolve) => setImmediate(resolve));

afterEach(() => mock.restoreAll());

describe('createRequest', () => {
  it('performs the fetch and returns the parsed JSON body', async () => {
    const fetchMock = mock.method(globalThis, 'fetch', async () =>
      fakeRes({ body: '{"id":"abc"}' })
    );

    const request = createRequest(descriptor());
    const result = await request('POST', '/things', { name: 'n' });

    assert.deepStrictEqual(result, { id: 'abc' });
    assert.strictEqual(fetchMock.mock.callCount(), 1);
    const [url, init] = fetchMock.mock.calls[0].arguments;
    assert.strictEqual(url, 'https://api.example.test/1/things');
    assert.strictEqual(init.method, 'POST');
    assert.strictEqual(init.body, '{"name":"n"}');
    assert.strictEqual(init.headers['Content-Type'], 'application/json');
    assert.strictEqual(init.headers.Authorization, 'Token tok');
  });

  it('sends no body when none is given', async () => {
    const fetchMock = mock.method(globalThis, 'fetch', async () => fakeRes());

    const request = createRequest(descriptor());
    await request('GET', '/things');

    assert.strictEqual(fetchMock.mock.calls[0].arguments[1].body, undefined);
  });

  it('applies the wrapBody and unwrapResponse envelopes', async () => {
    const fetchMock = mock.method(globalThis, 'fetch', async () =>
      fakeRes({ body: '{"data":{"gid":"42"}}' })
    );

    const request = createRequest(
      descriptor({
        wrapBody: (body) => ({ data: body }),
        unwrapResponse: (json) => json.data,
      })
    );
    const result = await request('POST', '/tasks', { name: 'n' });

    assert.deepStrictEqual(result, { gid: '42' });
    assert.strictEqual(
      fetchMock.mock.calls[0].arguments[1].body,
      '{"data":{"name":"n"}}'
    );
  });

  it('resolves auth per call — a failing strategy rejects before any fetch', async () => {
    const fetchMock = mock.method(globalThis, 'fetch', async () => fakeRes());

    const request = createRequest(
      descriptor({
        authStrategy: () => {
          throw new Error('TOKEN is not set');
        },
      })
    );

    await assert.rejects(request('GET', '/things'), {
      message: 'TOKEN is not set',
    });
    assert.strictEqual(fetchMock.mock.callCount(), 0);
  });

  it('throws on a non-ok response using the errorMessage hook', async () => {
    mock.method(globalThis, 'fetch', async () =>
      fakeRes({ status: 400, body: '{"message":"invalid id"}' })
    );

    const request = createRequest(descriptor());

    await assert.rejects(request('PUT', '/things/9'), {
      message: '[testClient] PUT /things/9 -> 400: invalid id',
    });
  });

  it('passes a non-JSON error body to the hook as raw text', async () => {
    mock.method(globalThis, 'fetch', async () =>
      fakeRes({ status: 401, body: 'invalid key' })
    );

    const request = createRequest(descriptor());

    await assert.rejects(request('GET', '/things'), {
      message: '[testClient] GET /things -> 401: invalid key',
    });
  });

  it('falls back to "unknown error" when the hook yields nothing', async () => {
    mock.method(globalThis, 'fetch', async () =>
      fakeRes({ status: 500, body: '' })
    );

    const request = createRequest(descriptor());

    await assert.rejects(request('GET', '/things'), {
      message: '[testClient] GET /things -> 500: unknown error',
    });
  });

  it('waits out a 429 using the retryDelayMs hook and retries once', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const warn = t.mock.method(console, 'warn', () => {});
    const responses = [
      fakeRes({ status: 429, headers: { 'retry-after': '2' } }),
      fakeRes({ body: '{"id":"after-retry"}' }),
    ];
    const fetchMock = t.mock.method(globalThis, 'fetch', async () =>
      responses.shift()
    );

    const request = createRequest(
      descriptor({
        retryDelayMs: (res) => Number(res.headers.get('retry-after')) * 1000,
      })
    );
    const pending = request('GET', '/things');
    await settle();
    t.mock.timers.tick(2_000);

    assert.deepStrictEqual(await pending, { id: 'after-retry' });
    assert.strictEqual(fetchMock.mock.callCount(), 2);
    assert.match(warn.mock.calls[0].arguments[0], /retrying in 2000ms/);
  });

  it('clamps the retry wait to the 1s–60s window', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const warn = t.mock.method(console, 'warn', () => {});
    const responses = [
      fakeRes({ status: 429 }),
      fakeRes(),
      fakeRes({ status: 429 }),
      fakeRes(),
    ];
    t.mock.method(globalThis, 'fetch', async () => responses.shift());

    // Below the floor: a stale window can compute to <= 0.
    let request = createRequest(descriptor({ retryDelayMs: () => -5_000 }));
    let pending = request('GET', '/things');
    await settle();
    t.mock.timers.tick(1_000);
    await pending;
    assert.match(warn.mock.calls[0].arguments[0], /retrying in 1000ms/);

    // Above the ceiling: never sleep longer than a minute.
    request = createRequest(descriptor({ retryDelayMs: () => 600_000 }));
    pending = request('GET', '/things');
    await settle();
    t.mock.timers.tick(60_000);
    await pending;
    assert.match(warn.mock.calls[1].arguments[0], /retrying in 60000ms/);
  });

  it('gives up after one retry and surfaces the second failure', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    t.mock.method(console, 'warn', () => {});
    const responses = [
      fakeRes({ status: 429 }),
      fakeRes({ status: 429, body: 'still limited' }),
    ];
    const fetchMock = t.mock.method(globalThis, 'fetch', async () =>
      responses.shift()
    );

    const request = createRequest(descriptor());
    const pending = assert.rejects(request('GET', '/things'), {
      message: '[testClient] GET /things -> 429: still limited',
    });
    await settle();
    t.mock.timers.tick(1_000);

    await pending;
    assert.strictEqual(fetchMock.mock.callCount(), 2);
  });
});
