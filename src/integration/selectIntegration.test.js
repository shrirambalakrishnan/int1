'use strict';

const { describe, it, mock, afterEach } = require('node:test');
const assert = require('node:assert');

const { Integration, IntegrationUserOAuthData } = require('../models');
const stubClient = require('./clients/stubClient');
const clickupClient = require('./clients/clickupClient');
const asanaClient = require('./clients/asanaClient');
const trelloClient = require('./clients/trelloClient');
const { selectIntegration } = require('./selectIntegration');

afterEach(() => mock.restoreAll());

describe('selectIntegration', () => {
  it("resolves an integration named 'clickup' to the clickup client", async () => {
    mock.method(Integration, 'findByPk', async () => ({ name: 'ClickUp' }));

    assert.strictEqual(await selectIntegration(1), clickupClient);
  });

  it("resolves an integration named 'asana' to the asana client", async () => {
    mock.method(Integration, 'findByPk', async () => ({ name: 'Asana' }));

    assert.strictEqual(await selectIntegration(1), asanaClient);
  });

  it("resolves an integration named 'trello' to the trello client", async () => {
    mock.method(Integration, 'findByPk', async () => ({ name: 'Trello' }));

    assert.strictEqual(await selectIntegration(1), trelloClient);
  });

  it("resolves an integration named 'basecamp' to a connection-bound client", async () => {
    mock.method(Integration, 'findByPk', async () => ({ id: 7, name: 'Basecamp' }));
    mock.method(IntegrationUserOAuthData, 'findAll', async () => [
      {
        accessToken: 'at',
        refreshToken: 'rt',
        expiresAt: new Date(Date.now() + 3_600_000),
        accountId: 'acc1',
      },
    ]);
    process.env.BASECAMP_CLIENT_ID = 'cid';
    process.env.BASECAMP_CLIENT_SECRET = 'secret';
    process.env.BASECAMP_PROJECT_ID = 'proj1';

    const client = await selectIntegration(7);

    // Not a shared singleton — a freshly built client exposing the six methods.
    assert.strictEqual(typeof client.createBoard, 'function');
    assert.strictEqual(typeof client.updateComment, 'function');
    assert.notStrictEqual(client, stubClient);
  });

  it('falls back to the stub client for unregistered integration names', async () => {
    mock.method(Integration, 'findByPk', async () => ({ name: 'jira' }));

    assert.strictEqual(await selectIntegration(1), stubClient);
  });

  it('falls back to the stub client when the integration does not exist', async () => {
    mock.method(Integration, 'findByPk', async () => null);

    assert.strictEqual(await selectIntegration(999), stubClient);
  });
});
