'use strict';

const { describe, it, mock, afterEach } = require('node:test');
const assert = require('node:assert');

const { Comment, Task, IntegrationUser } = require('../../models');
const {
  ExternalCommentEventsHandler,
} = require('./externalCommentEventsHandler');

const handler = new ExternalCommentEventsHandler();

afterEach(() => mock.restoreAll());

const actor = { externalUserId: '77', username: 'ext', email: null };

const createdEventFor = (externalCommentId, integrationId = 2) => ({
  type: 'ExternalCommentCreated',
  occurredAt: new Date().toISOString(),
  payload: {
    integrationId,
    externalTaskId: 'abc123',
    externalCommentId,
    content: 'remote comment',
    actor,
  },
});

const updatedEventFor = (externalCommentId, integrationId = 2) => ({
  type: 'ExternalCommentUpdated',
  occurredAt: new Date().toISOString(),
  payload: { integrationId, externalCommentId, content: 'edited', actor },
});

describe('onExternalCommentCreated', () => {
  it('mirrors an unknown external comment under its mirrored task', async () => {
    mock.method(Task, 'findOne', async () => ({ id: 20 }));
    mock.method(Comment, 'findOne', async () => null);
    mock.method(Comment, 'create', async (attrs) => ({ id: 30, ...attrs }));
    mock.method(IntegrationUser, 'findOrCreate', async () => [{ id: 5 }, true]);

    await handler.onExternalCommentCreated(createdEventFor('9001'));

    assert.strictEqual(Comment.create.mock.callCount(), 1);
    const attrs = Comment.create.mock.calls[0].arguments[0];
    assert.strictEqual(attrs.content, 'remote comment');
    assert.strictEqual(attrs.taskId, 20);
    assert.strictEqual(attrs.integrationCommentId, '9001');
    assert.strictEqual(attrs.createdByIntegrationUserId, 5);
    assert.ok(attrs.integrationUpdatedAt instanceof Date);
  });

  it('throws when the parent task is not mirrored yet (redelivery will retry)', async () => {
    mock.method(Task, 'findOne', async () => null);
    const create = mock.method(Comment, 'create', async () => ({}));

    await assert.rejects(
      () => handler.onExternalCommentCreated(createdEventFor('9001')),
      /not mirrored yet/
    );
    assert.strictEqual(create.mock.callCount(), 0);
  });

  it('is idempotent: skips an external comment that is already mirrored (echo suppression)', async () => {
    mock.method(Task, 'findOne', async () => ({ id: 20 }));
    mock.method(Comment, 'findOne', async () => ({ id: 30 }));
    const create = mock.method(Comment, 'create', async () => ({}));

    await handler.onExternalCommentCreated(createdEventFor('9001'));

    assert.strictEqual(create.mock.callCount(), 0);
  });
});

describe('onExternalCommentUpdated', () => {
  it('applies the new content to the mirrored comment and bumps integrationUpdatedAt', async () => {
    const comment = { id: 30, update: mock.fn() };
    mock.method(Comment, 'findOne', async () => comment);

    await handler.onExternalCommentUpdated(updatedEventFor('9001'));

    assert.strictEqual(comment.update.mock.callCount(), 1);
    const updateArg = comment.update.mock.calls[0].arguments[0];
    assert.strictEqual(updateArg.content, 'edited');
    assert.ok(updateArg.integrationUpdatedAt instanceof Date);
  });

  it('skips an external comment that was never mirrored (update before create)', async () => {
    mock.method(Comment, 'findOne', async () => null);
    const create = mock.method(Comment, 'create', async () => ({}));

    await handler.onExternalCommentUpdated(updatedEventFor('9001'));

    assert.strictEqual(create.mock.callCount(), 0);
  });
});
