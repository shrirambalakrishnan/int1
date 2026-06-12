'use strict';

const { describe, it, mock, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');

const { Integration } = require('../models');
const controller = require('./webhook');

const SECRET = 'test-webhook-secret';

beforeEach(() => {
  process.env.CLICKUP_WEBHOOK_SECRET = SECRET;
});

afterEach(() => {
  delete process.env.CLICKUP_WEBHOOK_SECRET;
  mock.restoreAll();
});

function sign(rawBody, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
}

// Minimal req/res stand-ins: the controller only uses body (raw Buffer),
// get('x-signature'), status().json() and json().
function reqFor(body, signature) {
  const raw = Buffer.from(JSON.stringify(body));
  return {
    body: raw,
    get: (name) =>
      name.toLowerCase() === 'x-signature' ? signature : undefined,
  };
}

function resRecorder() {
  const res = { statusCode: 200, jsonBody: undefined };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload) => {
    res.jsonBody = payload;
    return res;
  };
  return res;
}

describe('webhook controller (clickup)', () => {
  it('rejects a tampered or missing signature with 401', async () => {
    const body = { event: 'listCreated', list_id: 901 };

    for (const signature of [sign(Buffer.from('other body')), undefined]) {
      const res = resRecorder();
      await controller.clickup(reqFor(body, signature), res, mock.fn());
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

    await controller.clickup(reqFor(body, sign(raw)), res, mock.fn());

    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(res.jsonBody, { ok: true });
  });

  it('forwards a missing-secret error to the central handler (500), not a 401', async () => {
    delete process.env.CLICKUP_WEBHOOK_SECRET;

    const next = mock.fn();
    const res = resRecorder();
    await controller.clickup(
      reqFor({ event: 'listCreated' }, 'sig'),
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
