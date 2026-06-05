'use strict';

const { test, mock, afterEach } = require('node:test');
const assert = require('node:assert');

const { Board } = require('../../models');
const stubClient = require('../clients/stubClient');
const { BoardEventsHandler } = require('./boardEventsHandler');

const handler = new BoardEventsHandler();

afterEach(() => mock.restoreAll());

test('integrates an un-integrated board and persists the external id', async () => {
  const board = { id: 1, name: 'Test', integrationBoardId: null, update: mock.fn() };
  mock.method(Board, 'findByPk', async () => board);
  mock.method(stubClient, 'createBoard', async () => 12345);

  await handler.onBoardCreated({ type: 'BoardCreated', boardId: 1, integrationId: 2 });

  assert.strictEqual(stubClient.createBoard.mock.callCount(), 1);
  assert.strictEqual(board.update.mock.callCount(), 1);
  const updateArg = board.update.mock.calls[0].arguments[0];
  assert.strictEqual(updateArg.integrationBoardId, 12345);
  assert.ok(updateArg.integrationUpdatedAt instanceof Date);
});

test('is idempotent: skips a board that is already integrated', async () => {
  const board = { id: 1, integrationBoardId: 999, update: mock.fn() };
  mock.method(Board, 'findByPk', async () => board);
  mock.method(stubClient, 'createBoard', async () => 12345);

  await handler.onBoardCreated({ type: 'BoardCreated', boardId: 1, integrationId: 2 });

  assert.strictEqual(stubClient.createBoard.mock.callCount(), 0);
  assert.strictEqual(board.update.mock.callCount(), 0);
});

test('skips when the board no longer exists', async () => {
  mock.method(Board, 'findByPk', async () => null);
  mock.method(stubClient, 'createBoard', async () => 12345);

  await handler.onBoardCreated({ type: 'BoardCreated', boardId: 999, integrationId: 2 });

  assert.strictEqual(stubClient.createBoard.mock.callCount(), 0);
});
