'use strict';

const { describe, it, mock, afterEach } = require('node:test');
const assert = require('node:assert');

const clickupClient = require('../clients/clickupClient');
const { translateClickupWebhook } = require('./clickupWebhookTranslator');

afterEach(() => mock.restoreAll());

const historyWithUser = [
  { user: { id: 77, username: 'ext-user', email: 'ext@example.com' } },
];

describe('translateClickupWebhook', () => {
  it('returns null for an event type it does not translate', async () => {
    const event = await translateClickupWebhook(
      { event: 'taskDeleted', task_id: 'abc123' },
      2
    );
    assert.strictEqual(event, null);
  });

  it('translates listCreated into ExternalBoardCreated, fetching the list', async () => {
    mock.method(clickupClient, 'getList', async () => ({
      id: 901,
      name: 'Remote board',
    }));

    const event = await translateClickupWebhook(
      { event: 'listCreated', list_id: 901, history_items: historyWithUser },
      2
    );

    assert.strictEqual(event.type, 'ExternalBoardCreated');
    assert.deepStrictEqual(event.payload, {
      integrationId: 2,
      externalBoardId: '901',
      name: 'Remote board',
      actor: {
        externalUserId: '77',
        username: 'ext-user',
        email: 'ext@example.com',
      },
    });
  });

  it('translates taskCreated into ExternalTaskCreated with the parent list id', async () => {
    mock.method(clickupClient, 'getTask', async () => ({
      id: 'abc123',
      name: 'Remote task',
      description: 'details',
      list: { id: 901 },
    }));

    const event = await translateClickupWebhook(
      {
        event: 'taskCreated',
        task_id: 'abc123',
        history_items: historyWithUser,
      },
      2
    );

    assert.strictEqual(event.type, 'ExternalTaskCreated');
    assert.strictEqual(event.payload.externalBoardId, '901');
    assert.strictEqual(event.payload.externalTaskId, 'abc123');
    assert.strictEqual(event.payload.title, 'Remote task');
    assert.strictEqual(event.payload.description, 'details');
  });

  it('translates taskUpdated into ExternalTaskUpdated with a null actor when absent', async () => {
    mock.method(clickupClient, 'getTask', async () => ({
      id: 'abc123',
      name: 'Edited',
      description: '',
      list: { id: 901 },
    }));

    const event = await translateClickupWebhook(
      { event: 'taskUpdated', task_id: 'abc123' },
      2
    );

    assert.strictEqual(event.type, 'ExternalTaskUpdated');
    // Empty description normalizes to null (the canonical nullable column).
    assert.strictEqual(event.payload.description, null);
    assert.strictEqual(event.payload.actor, null);
    assert.strictEqual(event.payload.externalBoardId, undefined);
  });

  it('translates taskCommentPosted, taking the id from history_items and content from the API', async () => {
    mock.method(clickupClient, 'getTaskComments', async () => [
      { id: 9001, comment_text: 'remote comment' },
      { id: 9002, comment_text: 'other' },
    ]);

    const event = await translateClickupWebhook(
      {
        event: 'taskCommentPosted',
        task_id: 'abc123',
        history_items: [{ ...historyWithUser[0], comment: { id: 9001 } }],
      },
      2
    );

    assert.strictEqual(event.type, 'ExternalCommentCreated');
    assert.strictEqual(event.payload.externalCommentId, '9001');
    assert.strictEqual(event.payload.externalTaskId, 'abc123');
    assert.strictEqual(event.payload.content, 'remote comment');
  });

  it('returns null when the comment id is missing or the comment vanished remotely', async () => {
    mock.method(clickupClient, 'getTaskComments', async () => []);

    const noId = await translateClickupWebhook(
      { event: 'taskCommentUpdated', task_id: 'abc123', history_items: [{}] },
      2
    );
    assert.strictEqual(noId, null);

    const vanished = await translateClickupWebhook(
      {
        event: 'taskCommentUpdated',
        task_id: 'abc123',
        history_items: [{ comment: { id: 9001 } }],
      },
      2
    );
    assert.strictEqual(vanished, null);
  });
});
