'use strict';

/**
 * Registers the inbound webhook with Trello: one webhook on the Trello Board
 * pinned by TRELLO_BOARD_ID. Trello has no event filter — the webhook fires on
 * every action on that board, and the translator's action-type map decides what
 * gets mirrored.
 *
 * Two differences from the other providers' scripts:
 *  - Trello does NOT return a secret. Inbound deliveries are signed with the
 *    app's API secret (TRELLO_API_SECRET), which you already hold — store it in
 *    the Keychain ahead of time (printed below).
 *  - Like Asana, the server must already be running and publicly reachable at
 *    <endpointUrl> BEFORE this runs: Trello sends a HEAD to the callback URL
 *    during creation and only registers the webhook if it returns 200.
 *
 * Usage: node scripts/registerTrelloWebhook.js <endpointUrl>
 *   endpointUrl  public URL of this service's receiver, e.g.
 *                https://<tunnel-host>/webhooks/trello
 *                Must match TRELLO_WEBHOOK_CALLBACK_URL in .env exactly — the URL
 *                is part of the signed bytes the receiver recomputes.
 *
 * Needs TRELLO_BOARD_ID in .env and TRELLO_API_KEY / TRELLO_API_TOKEN exported
 * from the Keychain (see README "Secrets"), like the emit scripts.
 */
require('dotenv').config();

const { request } = require('../src/integration/clients/trelloClient');

async function main() {
  const endpoint = process.argv[2];
  if (!endpoint || !endpoint.startsWith('http')) {
    console.error('Usage: node scripts/registerTrelloWebhook.js <endpointUrl>');
    process.exit(1);
  }

  const boardId = process.env.TRELLO_BOARD_ID;
  if (!boardId) {
    console.error('[registerTrelloWebhook] TRELLO_BOARD_ID must be set');
    process.exit(1);
  }

  // Checked here only for a friendlier failure than the one that would otherwise
  // surface from inside the auth strategy at request time.
  if (!process.env.TRELLO_API_KEY || !process.env.TRELLO_API_TOKEN) {
    console.error(
      '[registerTrelloWebhook] TRELLO_API_KEY and TRELLO_API_TOKEN must be set. Export them first:\n' +
        '  export TRELLO_API_KEY=$(security find-generic-password -a "$USER" -s "TRELLO_API_KEY" -w)\n' +
        '  export TRELLO_API_TOKEN=$(security find-generic-password -a "$USER" -s "TRELLO_API_TOKEN" -w)'
    );
    process.exit(1);
  }

  const webhook = await request('POST', '/webhooks', {
    idModel: boardId,
    callbackURL: endpoint,
    description: 'int1 inbound sync',
  });

  console.log(`[registerTrelloWebhook] registered webhook ${webhook.id}`);
  console.log(`  board:    ${boardId}`);
  console.log(`  endpoint: ${endpoint}`);
  console.log('');
  console.log(
    'Set the callback URL in .env (it is part of the signed bytes the receiver verifies):'
  );
  console.log(`  TRELLO_WEBHOOK_CALLBACK_URL=${endpoint}`);
  console.log('');
  console.log(
    'Trello signs deliveries with your app secret — store it in the Keychain'
  );
  console.log(
    '(paste it when prompted; find it at trello.com/power-ups/admin):'
  );
  console.log(
    '  security add-generic-password -U -a "$USER" -s "TRELLO_API_SECRET" -w'
  );
  console.log('');
  console.log('Then export it before npm start:');
  console.log(
    '  export TRELLO_API_SECRET=$(security find-generic-password -a "$USER" -s "TRELLO_API_SECRET" -w)'
  );
}

main().catch((err) => {
  console.error('[registerTrelloWebhook] failed:', err);
  process.exit(1);
});
