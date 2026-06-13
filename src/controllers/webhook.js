'use strict';

const crypto = require('node:crypto');

const { Integration } = require('../models');
const {
  translateClickupWebhook,
} = require('../integration/inbound/clickupWebhookTranslator');
const {
  translateAsanaWebhookEvent,
} = require('../integration/inbound/asanaWebhookTranslator');
const {
  translateTrelloWebhook,
} = require('../integration/inbound/trelloWebhookTranslator');
const { processEvent } = require('../integration/eventProcessor');
const { sendError } = require('../utils/errors');

/**
 * Receives provider webhooks (inbound sync). The route parses bodies with
 * express.raw, not express.json: every provider signs the raw bytes, so they
 * must be hashed before any parsing.
 *
 * Response contract: 401 on a bad signature, 200 once the delivery is applied
 * or deliberately skipped, 500 (via the central handler) when a handler
 * throws — all three providers retry failed deliveries, so a throw becomes a
 * redelivery, exactly the role a broker nack will play later.
 */

// Read lazily, per call: secrets are exported from the Keychain into the
// shell (see README "Secrets"), so they aren't guaranteed to exist at module
// load.
function requiredSecret(envVar) {
  const secret = process.env[envVar];
  if (!secret) {
    throw new Error(`[webhook] ${envVar} is not set`);
  }
  return secret;
}

// Same lazy read for non-secret config that lives in .env (rather than the
// Keychain): Trello signs over its registered callback URL, so the receiver
// needs that exact URL — TRELLO_WEBHOOK_CALLBACK_URL — to recompute the HMAC.
function requiredConfig(envVar) {
  const value = process.env[envVar];
  if (!value) {
    throw new Error(`[webhook] ${envVar} is not set`);
  }
  return value;
}

// ClickUp and Asana sign the same way: hex HMAC-SHA256 over the raw body.
// (Trello differs — see isValidTrelloSignature below.)
function isValidSignature(rawBody, signatureHeader, secret) {
  if (typeof signatureHeader !== 'string' || signatureHeader.length === 0) {
    return false;
  }
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');
  const received = Buffer.from(signatureHeader);
  return (
    received.length === Buffer.byteLength(expected) &&
    crypto.timingSafeEqual(received, Buffer.from(expected))
  );
}

// Trello signs differently from ClickUp/Asana, so it gets its own function
// rather than folding into the shared one: base64 (not hex) HMAC-SHA1 (not
// SHA256) over the raw body with the registered callback URL appended, keyed by
// the Trello app secret. The header is X-Trello-Webhook.
function isValidTrelloSignature(rawBody, signatureHeader, secret, callbackUrl) {
  if (typeof signatureHeader !== 'string' || signatureHeader.length === 0) {
    return false;
  }
  const expected = crypto
    .createHmac('sha1', secret)
    .update(rawBody)
    .update(callbackUrl)
    .digest('base64');
  const received = Buffer.from(signatureHeader);
  return (
    received.length === Buffer.byteLength(expected) &&
    crypto.timingSafeEqual(received, Buffer.from(expected))
  );
}

async function clickup(req, res, next) {
  try {
    const secret = requiredSecret('CLICKUP_WEBHOOK_SECRET');
    if (!isValidSignature(req.body, req.get('x-signature'), secret)) {
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }

    const body = JSON.parse(req.body.toString('utf8'));

    // The endpoint is ClickUp-specific, so the Integration row is resolved by
    // its reference name (shipped in a migration), not by a URL param.
    const integration = await Integration.findOne({
      where: { name: 'clickup' },
    });
    if (!integration) {
      throw new Error('[webhook] no Integration row named "clickup"');
    }

    // processEvent runs inline (synchronously awaited) for now, so the HTTP
    // response doubles as the processing outcome. Once RabbitMQ fronts the
    // worker, this becomes: translate -> publish -> ack immediately; the
    // consumer calls processEvent and a nack replaces the 500-as-retry below.
    const event = await translateClickupWebhook(body, integration.id);
    if (event) {
      await processEvent(event);
    }

    res.json({ ok: true });
  } catch (err) {
    sendError(res, next, err);
  }
}

async function asana(req, res, next) {
  try {
    // Registration handshake: Asana POSTs the shared secret in X-Hook-Secret
    // and expects it echoed back. Handshakes carry no signature. The secret is
    // logged (with the storage commands) rather than persisted — storing it in
    // the Keychain is the operator's move, same as every other secret.
    const handshakeSecret = req.get('x-hook-secret');
    if (handshakeSecret) {
      console.log(
        '[webhook] Asana handshake received. Store the secret in the ' +
          'Keychain (paste it when prompted):\n' +
          '  security add-generic-password -U -a "$USER" -s "ASANA_WEBHOOK_SECRET" -w\n' +
          `  secret: ${handshakeSecret}\n` +
          'Then export it before npm start:\n' +
          '  export ASANA_WEBHOOK_SECRET=$(security find-generic-password -a "$USER" -s "ASANA_WEBHOOK_SECRET" -w)'
      );
      return res.set('x-hook-secret', handshakeSecret).status(200).end();
    }

    const secret = requiredSecret('ASANA_WEBHOOK_SECRET');
    if (!isValidSignature(req.body, req.get('x-hook-signature'), secret)) {
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }

    const body = JSON.parse(req.body.toString('utf8'));

    const integration = await Integration.findOne({
      where: { name: 'asana' },
    });
    if (!integration) {
      throw new Error('[webhook] no Integration row named "asana"');
    }

    // Asana batches events ({ events: [...] }) and sends empty batches as
    // 8-hourly heartbeats. Events are processed sequentially; the first throw
    // 500s the whole delivery and Asana redelivers the batch — already-applied
    // events then skip via the known-external-id guard, so redelivery of a
    // partially applied batch is idempotent.
    for (const webhookEvent of body.events ?? []) {
      const event = await translateAsanaWebhookEvent(
        webhookEvent,
        integration.id
      );
      if (event) {
        await processEvent(event);
      }
    }

    res.json({ ok: true });
  } catch (err) {
    sendError(res, next, err);
  }
}

// Trello verifies the callback URL at registration time with a HEAD request and
// creates the webhook only if it gets a 200 (no body, no signature). This is
// Trello's analogue of Asana's X-Hook-Secret handshake — but a bare reachability
// check, with no secret to echo (the secret is the pre-shared app secret).
function trelloHandshake(req, res) {
  res.status(200).end();
}

async function trello(req, res, next) {
  try {
    const secret = requiredSecret('TRELLO_API_SECRET');
    const callbackUrl = requiredConfig('TRELLO_WEBHOOK_CALLBACK_URL');
    if (
      !isValidTrelloSignature(
        req.body,
        req.get('x-trello-webhook'),
        secret,
        callbackUrl
      )
    ) {
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }

    const body = JSON.parse(req.body.toString('utf8'));

    const integration = await Integration.findOne({
      where: { name: 'trello' },
    });
    if (!integration) {
      throw new Error('[webhook] no Integration row named "trello"');
    }

    // Trello delivers one action per request (no batching, unlike Asana). An
    // unhandled action type translates to null and is acked; a handler throw
    // 500s and Trello redelivers (its retry is the broker-nack stand-in).
    const event = await translateTrelloWebhook(body, integration.id);
    if (event) {
      await processEvent(event);
    }

    res.json({ ok: true });
  } catch (err) {
    sendError(res, next, err);
  }
}

module.exports = { clickup, asana, trello, trelloHandshake };
