'use strict';

/**
 * DLQ test helper. Publishes a deliberately-invalid event *through the broker*
 * — unlike the emit:* scripts, which call processEvent() directly and bypass
 * RabbitMQ. The worker consumes it, validateEvent() throws at the boundary, the
 * consumer nacks (requeue:false), and the broker dead-letters it to
 * int1worker.dlq. Use this to verify the DLQ wiring end-to-end.
 *
 * Start the worker first (npm run start:worker), then:
 *   node scripts/emitPoison.js
 *
 * Expect: worker logs "event processing failed, dead-lettering" and the message
 * appears in int1worker.dlq (with x-death headers) — not int1worker.queue.
 */
require('dotenv').config();

const { initRabbitMQ, publish, closeRabbitMQ } = require('../src/rabbitMQ');

async function main() {
  await initRabbitMQ(); // asserts topology incl. events.dlx + int1worker.dlq

  // Routing key the worker queue is bound to, but an empty payload so
  // validateEvent('BoardCreated') throws on the missing required fields.
  const poison = {
    type: 'BoardCreated',
    occurredAt: new Date().toISOString(),
    payload: {},
  };

  await publish('boards.created', poison);
  console.log('[emitPoison] published poison boards.created — expect it in int1worker.dlq');

  // Give the broker a moment to flush the publish before closing the connection
  // (publish() uses a plain channel, not publisher confirms).
  await new Promise((resolve) => setTimeout(resolve, 300));
  await closeRabbitMQ();
}

main().catch(async (err) => {
  console.error('[emitPoison] failed:', err);
  await closeRabbitMQ();
  process.exit(1);
});
