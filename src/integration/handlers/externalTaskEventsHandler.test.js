'use strict';

const { describe, it, mock, afterEach } = require('node:test');
const assert = require('node:assert');

const { Task, Board, IntegrationUser } = require('../../models');
const { ExternalTaskEventsHandler } = require('./externalTaskEventsHandler');

const handler = new ExternalTaskEventsHandler();

afterEach(() => mock.restoreAll());

const actor = { externalUserId: '77', username: 'ext', email: null };

const createdEventFor = (externalTaskId, integrationId = 2) => ({
  type: 'ExternalTaskCreated',
  occurredAt: new Date().toISOString(),
  payload: {
    integrationId,
    externalBoardId: 'list-1',
    externalTaskId,
    title: 'Remote task',
    description: 'from clickup',
    actor,
  },
});

const updatedEventFor = (externalTaskId, integrationId = 2) => ({
  type: 'ExternalTaskUpdated',
  occurredAt: new Date().toISOString(),
  payload: {
    integrationId,
    externalTaskId,
    title: 'Edited',
    description: null,
    actor,
  },
});

describe('onExternalTaskCreated', () => {
  it('mirrors an unknown external task under its mirrored board', async () => {
    mock.method(Board, 'findOne', async () => ({ id: 10 }));
    mock.method(Task, 'findOne', async () => null);
    mock.method(Task, 'create', async (attrs) => ({ id: 20, ...attrs }));
    mock.method(IntegrationUser, 'findOrCreate', async () => [{ id: 5 }, true]);

    await handler.onExternalTaskCreated(createdEventFor('abc123'));

    assert.strictEqual(Task.create.mock.callCount(), 1);
    const attrs = Task.create.mock.calls[0].arguments[0];
    assert.strictEqual(attrs.title, 'Remote task');
    assert.strictEqual(attrs.description, 'from clickup');
    assert.strictEqual(attrs.boardId, 10);
    assert.strictEqual(attrs.integrationTaskId, 'abc123');
    assert.strictEqual(attrs.createdByIntegrationUserId, 5);
    assert.ok(attrs.integrationUpdatedAt instanceof Date);
  });

  it('throws when the parent board is not mirrored yet (redelivery will retry)', async () => {
    mock.method(Board, 'findOne', async () => null);
    const create = mock.method(Task, 'create', async () => ({}));

    await assert.rejects(
      () => handler.onExternalTaskCreated(createdEventFor('abc123')),
      /not mirrored yet/
    );
    assert.strictEqual(create.mock.callCount(), 0);
  });

  it('is idempotent: skips an external task that is already mirrored (echo suppression)', async () => {
    mock.method(Board, 'findOne', async () => ({ id: 10 }));
    mock.method(Task, 'findOne', async () => ({ id: 20 }));
    const create = mock.method(Task, 'create', async () => ({}));

    await handler.onExternalTaskCreated(createdEventFor('abc123'));

    assert.strictEqual(create.mock.callCount(), 0);
  });
});

describe('onExternalTaskUpdated', () => {
  it('applies title/description to the mirrored task and bumps integrationUpdatedAt', async () => {
    const task = { id: 20, update: mock.fn() };
    mock.method(Task, 'findOne', async () => task);

    await handler.onExternalTaskUpdated(updatedEventFor('abc123'));

    assert.strictEqual(task.update.mock.callCount(), 1);
    const updateArg = task.update.mock.calls[0].arguments[0];
    assert.strictEqual(updateArg.title, 'Edited');
    assert.strictEqual(updateArg.description, null);
    assert.ok(updateArg.integrationUpdatedAt instanceof Date);
  });

  it('skips an external task that was never mirrored (update before create)', async () => {
    mock.method(Task, 'findOne', async () => null);
    const create = mock.method(Task, 'create', async () => ({}));

    await handler.onExternalTaskUpdated(updatedEventFor('abc123'));

    assert.strictEqual(create.mock.callCount(), 0);
  });
});
