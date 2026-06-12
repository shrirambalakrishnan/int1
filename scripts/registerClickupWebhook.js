'use strict';

/**
 * Registers the inbound webhook with ClickUp: one webhook on the workspace
 * (CLICKUP_TEAM_ID), scoped to the synced Space (CLICKUP_SPACE_ID), subscribed
 * to the six events the receiver translates. Prints the returned webhook id
 * and secret — store the secret in the Keychain (command printed below), never
 * in .env.
 *
 * Usage: node scripts/registerClickupWebhook.js <endpointUrl>
 *   endpointUrl  public URL of this service's receiver, e.g.
 *                https://<tunnel-host>/webhooks/clickup
 *
 * Needs CLICKUP_TEAM_ID / CLICKUP_SPACE_ID in .env and CLICKUP_API_TOKEN
 * exported from the Keychain (see README "Secrets"), like the emit scripts.
 */
require('dotenv').config();

const { request } = require('../src/integration/clients/clickupClient');

// Keep in sync with the translators in
// src/integration/inbound/clickupWebhookTranslator.js.
const EVENTS = [
  'listCreated',
  'listUpdated',
  'taskCreated',
  'taskUpdated',
  'taskCommentPosted',
  'taskCommentUpdated',
];

async function main() {
  const endpoint = process.argv[2];
  if (!endpoint || !endpoint.startsWith('http')) {
    console.error(
      'Usage: node scripts/registerClickupWebhook.js <endpointUrl>'
    );
    process.exit(1);
  }

  const teamId = process.env.CLICKUP_TEAM_ID;
  const spaceId = process.env.CLICKUP_SPACE_ID;
  if (!teamId || !spaceId) {
    console.error(
      '[registerClickupWebhook] CLICKUP_TEAM_ID and CLICKUP_SPACE_ID must be set'
    );
    process.exit(1);
  }

  // Checked here only for a friendlier failure than the one that would
  // otherwise surface from inside the auth strategy at request time.
  if (!process.env.CLICKUP_API_TOKEN) {
    console.error(
      '[registerClickupWebhook] CLICKUP_API_TOKEN is not set. Export it first:\n' +
        '  export CLICKUP_API_TOKEN=$(security find-generic-password -a "$USER" -s "CLICKUP_API_TOKEN" -w)'
    );
    process.exit(1);
  }

  const result = await request('POST', `/team/${teamId}/webhook`, {
    endpoint,
    events: EVENTS,
    space_id: Number(spaceId),
  });

  console.log(
    `[registerClickupWebhook] registered webhook ${result.webhook.id}`
  );
  console.log(`  endpoint: ${endpoint}`);
  console.log(`  events:   ${EVENTS.join(', ')}`);
  console.log('');
  console.log('Store the secret in the Keychain (paste it when prompted):');
  console.log(
    '  security add-generic-password -U -a "$USER" -s "CLICKUP_WEBHOOK_SECRET" -w'
  );
  console.log('');
  console.log(`  secret: ${result.webhook.secret}`);
  console.log('');
  console.log('Then export it before npm start:');
  console.log(
    '  export CLICKUP_WEBHOOK_SECRET=$(security find-generic-password -a "$USER" -s "CLICKUP_WEBHOOK_SECRET" -w)'
  );
}

main().catch((err) => {
  console.error('[registerClickupWebhook] failed:', err);
  process.exit(1);
});
