'use strict';

const { describe, it, mock, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');

const { Board, Integration } = require('../../models');
const stubClient = require('../clients/stubClient');
const { BoardEventsHandler } = require('./boardEventsHandler');

const handler = new BoardEventsHandler();

// selectIntegration resolves the Integration row by pk to pick a client;
// an unknown/missing integration falls back to stubClient, which is the
// client these tests mock.
beforeEach(() => mock.method(Integration, 'findByPk', async () => null));
afterEach(() => mock.restoreAll());

const eventFor = (boardId, integrationId = 2) => ({
  type: 'BoardCreated',
  occurredAt: new Date().toISOString(),
  payload: { boardId, integrationId },
});

const updatedEventFor = (boardId, integrationId = 2) => ({
  type: 'BoardUpdated',
  occurredAt: new Date().toISOString(),
  payload: { boardId, integrationId },
});

describe('onBoardCreated', () => {
  it('integrates an un-integrated board and persists the external id', async () => {
    const board = { id: 1, name: 'Test', integrationBoardId: null, update: mock.fn() };
    mock.method(Board, 'findByPk', async () => board);
    mock.method(stubClient, 'createBoard', async () => 12345);

    await handler.onBoardCreated(eventFor(1));

    assert.strictEqual(stubClient.createBoard.mock.callCount(), 1);
    assert.strictEqual(board.update.mock.callCount(), 1);
    const updateArg = board.update.mock.calls[0].arguments[0];
    assert.strictEqual(updateArg.integrationBoardId, 12345);
    assert.ok(updateArg.integrationUpdatedAt instanceof Date);
  });

  it('is idempotent: skips a board that is already integrated', async () => {
    const board = { id: 1, integrationBoardId: 999, update: mock.fn() };
    mock.method(Board, 'findByPk', async () => board);
    mock.method(stubClient, 'createBoard', async () => 12345);

    await handler.onBoardCreated(eventFor(1));

    assert.strictEqual(stubClient.createBoard.mock.callCount(), 0);
    assert.strictEqual(board.update.mock.callCount(), 0);
  });

  it('skips when the board no longer exists', async () => {
    mock.method(Board, 'findByPk', async () => null);
    mock.method(stubClient, 'createBoard', async () => 12345);

    await handler.onBoardCreated(eventFor(999));

    assert.strictEqual(stubClient.createBoard.mock.callCount(), 0);
  });
});

describe('onBoardUpdated', () => {
  it('pushes an update for an integrated board and bumps integrationUpdatedAt', async () => {
    const board = { id: 1, name: 'Test', integrationBoardId: 999, update: mock.fn() };
    mock.method(Board, 'findByPk', async () => board);
    mock.method(stubClient, 'updateBoard', async () => {});

    await handler.onBoardUpdated(updatedEventFor(1));

    assert.strictEqual(stubClient.updateBoard.mock.callCount(), 1);
    assert.strictEqual(board.update.mock.callCount(), 1);
    const updateArg = board.update.mock.calls[0].arguments[0];
    assert.ok(updateArg.integrationUpdatedAt instanceof Date);
  });

  it('skips a board that was never integrated', async () => {
    const board = { id: 1, integrationBoardId: null, update: mock.fn() };
    mock.method(Board, 'findByPk', async () => board);
    mock.method(stubClient, 'updateBoard', async () => {});

    await handler.onBoardUpdated(updatedEventFor(1));

    assert.strictEqual(stubClient.updateBoard.mock.callCount(), 0);
    assert.strictEqual(board.update.mock.callCount(), 0);
  });

  it('skips when the board no longer exists', async () => {
    mock.method(Board, 'findByPk', async () => null);
    mock.method(stubClient, 'updateBoard', async () => {});

    await handler.onBoardUpdated(updatedEventFor(999));

    assert.strictEqual(stubClient.updateBoard.mock.callCount(), 0);
  });
});
