'use strict';

const { describe, it, mock, afterEach } = require('node:test');
const assert = require('node:assert');

const { Integration } = require('../models');
const stubClient = require('./clients/stubClient');
const clickupClient = require('./clients/clickupClient');
const { selectIntegration } = require('./selectIntegration');

afterEach(() => mock.restoreAll());

describe('selectIntegration', () => {
  it("resolves an integration named 'clickup' to the clickup client", async () => {
    mock.method(Integration, 'findByPk', async () => ({ name: 'ClickUp' }));

    assert.strictEqual(await selectIntegration(1), clickupClient);
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
