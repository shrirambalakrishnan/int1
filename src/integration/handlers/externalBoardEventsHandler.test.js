'use strict';

const { describe, it, mock, afterEach } = require('node:test');
const assert = require('node:assert');

const { Board, IntegrationUser } = require('../../models');
const { ExternalBoardEventsHandler } = require('./externalBoardEventsHandler');

const handler = new ExternalBoardEventsHandler();

afterEach(() => mock.restoreAll());

const actor = { externalUserId: '77', username: 'ext', email: null };

const createdEventFor = (externalBoardId, integrationId = 2) => ({
  type: 'ExternalBoardCreated',
  occurredAt: new Date().toISOString(),
  payload: { integrationId, externalBoardId, name: 'Remote board', actor },
});

const updatedEventFor = (externalBoardId, integrationId = 2) => ({
  type: 'ExternalBoardUpdated',
  occurredAt: new Date().toISOString(),
  payload: { integrationId, externalBoardId, name: 'Renamed', actor },
});

describe('onExternalBoardCreated', () => {
  it('mirrors an unknown external board as a new Board with the actor attributed', async () => {
    mock.method(Board, 'findOne', async () => null);
    mock.method(Board, 'create', async (attrs) => ({ id: 10, ...attrs }));
    mock.method(IntegrationUser, 'findOrCreate', async () => [{ id: 5 }, true]);

    await handler.onExternalBoardCreated(createdEventFor('list-1'));

    assert.strictEqual(Board.create.mock.callCount(), 1);
    const attrs = Board.create.mock.calls[0].arguments[0];
    assert.strictEqual(attrs.name, 'Remote board');
    assert.strictEqual(attrs.integrationId, 2);
    assert.strictEqual(attrs.integrationBoardId, 'list-1');
    assert.strictEqual(attrs.createdByIntegrationUserId, 5);
    assert.ok(attrs.integrationUpdatedAt instanceof Date);
  });

  it('is idempotent: skips an external board that is already mirrored (echo suppression)', async () => {
    mock.method(Board, 'findOne', async () => ({ id: 10 }));
    mock.method(Board, 'create', async () => ({}));

    await handler.onExternalBoardCreated(createdEventFor('list-1'));

    assert.strictEqual(Board.create.mock.callCount(), 0);
  });

  it('leaves the actor null when the provider sent none', async () => {
    mock.method(Board, 'findOne', async () => null);
    mock.method(Board, 'create', async (attrs) => ({ id: 10, ...attrs }));
    const findOrCreate = mock.method(
      IntegrationUser,
      'findOrCreate',
      async () => [{ id: 5 }, true]
    );

    const event = createdEventFor('list-1');
    event.payload.actor = null;
    await handler.onExternalBoardCreated(event);

    assert.strictEqual(findOrCreate.mock.callCount(), 0);
    const attrs = Board.create.mock.calls[0].arguments[0];
    assert.strictEqual(attrs.createdByIntegrationUserId, null);
  });
});

describe('onExternalBoardUpdated', () => {
  it('applies the new name to the mirrored board and bumps integrationUpdatedAt', async () => {
    const board = { id: 10, update: mock.fn() };
    mock.method(Board, 'findOne', async () => board);

    await handler.onExternalBoardUpdated(updatedEventFor('list-1'));

    assert.strictEqual(board.update.mock.callCount(), 1);
    const updateArg = board.update.mock.calls[0].arguments[0];
    assert.strictEqual(updateArg.name, 'Renamed');
    assert.ok(updateArg.integrationUpdatedAt instanceof Date);
  });

  it('skips an external board that was never mirrored (update before create)', async () => {
    mock.method(Board, 'findOne', async () => null);
    const create = mock.method(Board, 'create', async () => ({}));

    await handler.onExternalBoardUpdated(updatedEventFor('list-1'));

    assert.strictEqual(create.mock.callCount(), 0);
  });
});
