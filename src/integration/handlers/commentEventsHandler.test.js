'use strict';

const { describe, it, mock, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');

const { Comment, Task, Integration } = require('../../models');
const stubClient = require('../clients/stubClient');
const { CommentEventsHandler } = require('./commentEventsHandler');

const handler = new CommentEventsHandler();

// selectIntegration resolves the Integration row by pk to pick a client;
// an unknown/missing integration falls back to stubClient, which is the
// client these tests mock.
beforeEach(() => mock.method(Integration, 'findByPk', async () => null));
afterEach(() => mock.restoreAll());

const eventFor = (commentId, integrationId = 2) => ({
  type: 'CommentCreated',
  occurredAt: new Date().toISOString(),
  payload: { commentId, integrationId, content: 'Test' },
});

const updatedEventFor = (commentId, integrationId = 2) => ({
  type: 'CommentUpdated',
  occurredAt: new Date().toISOString(),
  payload: { commentId, integrationId, content: 'Test' },
});

describe('onCommentCreated', () => {
  it('integrates an un-integrated comment and persists the external id', async () => {
    const comment = { id: 1, taskId: 5, integrationCommentId: null, update: mock.fn() };
    const task = { id: 5, integrationTaskId: '86d3a4z65' };
    mock.method(Comment, 'findByPk', async () => comment);
    mock.method(Task, 'findByPk', async () => task);
    mock.method(stubClient, 'createComment', async () => 12345);

    await handler.onCommentCreated(eventFor(1));

    assert.strictEqual(stubClient.createComment.mock.callCount(), 1);
    // The parent task rides along so the client can address its remote counterpart.
    assert.deepStrictEqual(stubClient.createComment.mock.calls[0].arguments, [comment, task]);
    assert.strictEqual(comment.update.mock.callCount(), 1);
    const updateArg = comment.update.mock.calls[0].arguments[0];
    assert.strictEqual(updateArg.integrationCommentId, 12345);
    assert.ok(updateArg.integrationUpdatedAt instanceof Date);
  });

  it('throws when the parent task is missing', async () => {
    const comment = { id: 1, taskId: 5, integrationCommentId: null, update: mock.fn() };
    mock.method(Comment, 'findByPk', async () => comment);
    mock.method(Task, 'findByPk', async () => null);
    mock.method(stubClient, 'createComment', async () => 12345);

    await assert.rejects(() => handler.onCommentCreated(eventFor(1)), /task 5 is missing/);

    assert.strictEqual(stubClient.createComment.mock.callCount(), 0);
    assert.strictEqual(comment.update.mock.callCount(), 0);
  });

  it('throws when the parent task is not integrated yet', async () => {
    const comment = { id: 1, taskId: 5, integrationCommentId: null, update: mock.fn() };
    mock.method(Comment, 'findByPk', async () => comment);
    mock.method(Task, 'findByPk', async () => ({ id: 5, integrationTaskId: null }));
    mock.method(stubClient, 'createComment', async () => 12345);

    await assert.rejects(() => handler.onCommentCreated(eventFor(1)), /task 5 is not integrated yet/);

    assert.strictEqual(stubClient.createComment.mock.callCount(), 0);
    assert.strictEqual(comment.update.mock.callCount(), 0);
  });

  it('is idempotent: skips a comment that is already integrated', async () => {
    const comment = { id: 1, integrationCommentId: 999, update: mock.fn() };
    mock.method(Comment, 'findByPk', async () => comment);
    mock.method(stubClient, 'createComment', async () => 12345);

    await handler.onCommentCreated(eventFor(1));

    assert.strictEqual(stubClient.createComment.mock.callCount(), 0);
    assert.strictEqual(comment.update.mock.callCount(), 0);
  });

  it('skips when the comment no longer exists', async () => {
    mock.method(Comment, 'findByPk', async () => null);
    mock.method(stubClient, 'createComment', async () => 12345);

    await handler.onCommentCreated(eventFor(999));

    assert.strictEqual(stubClient.createComment.mock.callCount(), 0);
  });
});

describe('onCommentUpdated', () => {
  it('pushes an update for an integrated comment and bumps integrationUpdatedAt', async () => {
    const comment = { id: 1, integrationCommentId: 999, update: mock.fn() };
    mock.method(Comment, 'findByPk', async () => comment);
    mock.method(stubClient, 'updateComment', async () => {});

    await handler.onCommentUpdated(updatedEventFor(1));

    assert.strictEqual(stubClient.updateComment.mock.callCount(), 1);
    assert.strictEqual(comment.update.mock.callCount(), 1);
    const updateArg = comment.update.mock.calls[0].arguments[0];
    assert.ok(updateArg.integrationUpdatedAt instanceof Date);
  });

  it('skips a comment that was never integrated', async () => {
    const comment = { id: 1, integrationCommentId: null, update: mock.fn() };
    mock.method(Comment, 'findByPk', async () => comment);
    mock.method(stubClient, 'updateComment', async () => {});

    await handler.onCommentUpdated(updatedEventFor(1));

    assert.strictEqual(stubClient.updateComment.mock.callCount(), 0);
    assert.strictEqual(comment.update.mock.callCount(), 0);
  });

  it('skips when the comment no longer exists', async () => {
    mock.method(Comment, 'findByPk', async () => null);
    mock.method(stubClient, 'updateComment', async () => {});

    await handler.onCommentUpdated(updatedEventFor(999));

    assert.strictEqual(stubClient.updateComment.mock.callCount(), 0);
  });
});
