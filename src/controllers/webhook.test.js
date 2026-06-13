'use strict';

const { describe, it, mock, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');

const { Integration } = require('../models');
const controller = require('./webhook');

const SECRET = 'test-webhook-secret';

beforeEach(() => {
  process.env.CLICKUP_WEBHOOK_SECRET = SECRET;
  process.env.ASANA_WEBHOOK_SECRET = SECRET;
});

afterEach(() => {
  delete process.env.CLICKUP_WEBHOOK_SECRET;
  delete process.env.ASANA_WEBHOOK_SECRET;
  mock.restoreAll();
});

function sign(rawBody, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
}

// Minimal req/res stand-ins: the controllers only use body (raw Buffer),
// get(header), set(header), status().json()/.end() and json().
function reqFor(body, headers = {}) {
  const lowered = Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])
  );
  return {
    body: Buffer.from(JSON.stringify(body)),
    get: (name) => lowered[name.toLowerCase()],
  };
}

function resRecorder() {
  const res = {
    statusCode: 200,
    jsonBody: undefined,
    headers: {},
    ended: false,
  };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload) => {
    res.jsonBody = payload;
    return res;
  };
  res.set = (name, value) => {
    res.headers[name.toLowerCase()] = value;
    return res;
  };
  res.end = () => {
    res.ended = true;
    return res;
  };
  return res;
}

describe('webhook controller (clickup)', () => {
  it('rejects a tampered or missing signature with 401', async () => {
    const body = { event: 'listCreated', list_id: 901 };

    for (const signature of [sign(Buffer.from('other body')), undefined]) {
      const res = resRecorder();
      await controller.clickup(
        reqFor(body, { 'x-signature': signature }),
        res,
        mock.fn()
      );
      assert.strictEqual(res.statusCode, 401);
    }
  });

  it('acks an unhandled event type with 200 after verifying the signature', async () => {
    mock.method(Integration, 'findOne', async () => ({
      id: 2,
      name: 'clickup',
    }));

    const body = { event: 'goalCreated' };
    const raw = Buffer.from(JSON.stringify(body));
    const res = resRecorder();

    await controller.clickup(
      reqFor(body, { 'x-signature': sign(raw) }),
      res,
      mock.fn()
    );

    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(res.jsonBody, { ok: true });
  });

  it('forwards a missing-secret error to the central handler (500), not a 401', async () => {
    delete process.env.CLICKUP_WEBHOOK_SECRET;

    const next = mock.fn();
    const res = resRecorder();
    await controller.clickup(
      reqFor({ event: 'listCreated' }, { 'x-signature': 'sig' }),
      res,
      next
    );

    assert.strictEqual(next.mock.callCount(), 1);
    assert.match(
      next.mock.calls[0].arguments[0].message,
      /CLICKUP_WEBHOOK_SECRET/
    );
  });
});

describe('webhook controller (asana)', () => {
  it('echoes X-Hook-Secret back with 200 on the registration handshake', async () => {
    const res = resRecorder();

    await controller.asana(
      reqFor({}, { 'x-hook-secret': 'new-shared-secret' }),
      res,
      mock.fn()
    );

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.headers['x-hook-secret'], 'new-shared-secret');
    assert.strictEqual(res.ended, true);
  });

  it('rejects a tampered or missing signature with 401', async () => {
    const body = { events: [] };

    for (const signature of [sign(Buffer.from('other body')), undefined]) {
      const res = resRecorder();
      await controller.asana(
        reqFor(body, { 'x-hook-signature': signature }),
        res,
        mock.fn()
      );
      assert.strictEqual(res.statusCode, 401);
    }
  });

  it('acks a heartbeat (empty events) with 200 after verifying the signature', async () => {
    mock.method(Integration, 'findOne', async () => ({ id: 3, name: 'asana' }));

    const body = { events: [] };
    const raw = Buffer.from(JSON.stringify(body));
    const res = resRecorder();

    await controller.asana(
      reqFor(body, { 'x-hook-signature': sign(raw) }),
      res,
      mock.fn()
    );

    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(res.jsonBody, { ok: true });
  });

  it('acks a batch of unhandled events with 200', async () => {
    mock.method(Integration, 'findOne', async () => ({ id: 3, name: 'asana' }));

    const body = {
      events: [
        { resource: { gid: '1', resource_type: 'task' }, action: 'deleted' },
        { resource: { gid: '2', resource_type: 'project' }, action: 'removed' },
      ],
    };
    const raw = Buffer.from(JSON.stringify(body));
    const res = resRecorder();

    await controller.asana(
      reqFor(body, { 'x-hook-signature': sign(raw) }),
      res,
      mock.fn()
    );

    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(res.jsonBody, { ok: true });
  });

  it('forwards a missing-secret error to the central handler (500), not a 401', async () => {
    delete process.env.ASANA_WEBHOOK_SECRET;

    const next = mock.fn();
    const res = resRecorder();
    await controller.asana(
      reqFor({ events: [] }, { 'x-hook-signature': 'sig' }),
      res,
      next
    );

    assert.strictEqual(next.mock.callCount(), 1);
    assert.match(
      next.mock.calls[0].arguments[0].message,
      /ASANA_WEBHOOK_SECRET/
    );
  });
});
