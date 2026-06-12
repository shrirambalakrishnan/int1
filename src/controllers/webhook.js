'use strict';

const crypto = require('node:crypto');

const { Integration } = require('../models');
const {
  translateClickupWebhook,
} = require('../integration/inbound/clickupWebhookTranslator');
const { processEvent } = require('../integration/eventProcessor');
const { sendError } = require('../utils/errors');

/**
 * Receives ClickUp webhooks (inbound sync). The route parses the body with
 * express.raw, not express.json: the signature is HMAC-SHA256 over the raw
 * bytes, so they must be hashed before any parsing.
 *
 * Response contract: 401 on a bad signature, 200 once the event is applied or
 * deliberately skipped, 500 (via the central handler) when a handler throws —
 * ClickUp retries failed deliveries, so a throw becomes a redelivery, exactly
 * the role a broker nack will play later.
 */

// Read lazily, per call: the secret is exported from the Keychain into the
// shell (see README "Secrets"), so it isn't guaranteed to exist at module load.
function webhookSecret() {
  const secret = process.env.CLICKUP_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error('[webhook] CLICKUP_WEBHOOK_SECRET is not set');
  }
  return secret;
}

function isValidSignature(rawBody, signatureHeader) {
  if (typeof signatureHeader !== 'string' || signatureHeader.length === 0) {
    return false;
  }
  const expected = crypto
    .createHmac('sha256', webhookSecret())
    .update(rawBody)
    .digest('hex');
  const received = Buffer.from(signatureHeader);
  return (
    received.length === Buffer.byteLength(expected) &&
    crypto.timingSafeEqual(received, Buffer.from(expected))
  );
}

async function clickup(req, res, next) {
  try {
    if (!isValidSignature(req.body, req.get('x-signature'))) {
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

module.exports = { clickup };
