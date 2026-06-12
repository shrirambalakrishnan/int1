'use strict';

/**
 * Registers an inbound webhook with Asana: one webhook per synced Project
 * (workspace webhooks cannot carry task or story events), filtered to the
 * five events the receiver translates.
 *
 * Unlike ClickUp, the secret is NOT returned by this call. Asana performs a
 * handshake DURING registration: it POSTs X-Hook-Secret to the receiver,
 * which echoes it back and logs it with the Keychain storage commands. So the
 * server must be running and publicly reachable at <endpointUrl> BEFORE this
 * script runs — and the secret lands in the server logs, not here.
 *
 * Usage: node scripts/registerAsanaWebhook.js <endpointUrl> <projectGid>
 *   endpointUrl  public URL of this service's receiver, e.g.
 *                https://<tunnel-host>/webhooks/asana
 *   projectGid   the Asana project to watch (a Board's integrationBoardId)
 *
 * Needs ASANA_API_TOKEN exported from the Keychain (see README "Secrets").
 */
require('dotenv').config();

const { request } = require('../src/integration/clients/asanaClient');

// Keep in sync with the translators in
// src/integration/inbound/asanaWebhookTranslator.js.
const FILTERS = [
  { resource_type: 'project', action: 'changed' },
  { resource_type: 'task', action: 'added' },
  { resource_type: 'task', action: 'changed' },
  {
    resource_type: 'story',
    action: 'added',
    resource_subtype: 'comment_added',
  },
  {
    resource_type: 'story',
    action: 'changed',
    resource_subtype: 'comment_added',
  },
];

async function main() {
  const [endpoint, projectGid] = process.argv.slice(2);
  if (!endpoint || !endpoint.startsWith('http') || !projectGid) {
    console.error(
      'Usage: node scripts/registerAsanaWebhook.js <endpointUrl> <projectGid>'
    );
    process.exit(1);
  }

  // Checked here only for a friendlier failure than the one that would
  // otherwise surface from inside the auth strategy at request time.
  if (!process.env.ASANA_API_TOKEN) {
    console.error(
      '[registerAsanaWebhook] ASANA_API_TOKEN is not set. Export it first:\n' +
        '  export ASANA_API_TOKEN=$(security find-generic-password -a "$USER" -s "ASANA_API_TOKEN" -w)'
    );
    process.exit(1);
  }

  const webhook = await request('POST', '/webhooks', {
    resource: projectGid,
    target: endpoint,
    filters: FILTERS,
  });

  console.log(`[registerAsanaWebhook] registered webhook ${webhook.gid}`);
  console.log(`  project:  ${projectGid}`);
  console.log(`  endpoint: ${endpoint}`);
  console.log('');
  console.log(
    'The shared secret was delivered to the receiver during the handshake — '
  );
  console.log(
    'check the server logs for the X-Hook-Secret value and the Keychain'
  );
  console.log('commands to store and export it (ASANA_WEBHOOK_SECRET).');
}

main().catch((err) => {
  console.error('[registerAsanaWebhook] failed:', err);
  process.exit(1);
});
