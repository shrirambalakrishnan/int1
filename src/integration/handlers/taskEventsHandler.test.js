'use strict';

const { describe, it, mock, afterEach } = require('node:test');
const assert = require('node:assert');

const { Task } = require('../../models');
const stubClient = require('../clients/stubClient');
const { TaskEventsHandler } = require('./taskEventsHandler');

const handler = new TaskEventsHandler();

afterEach(() => mock.restoreAll());

const eventFor = (taskId, integrationId = 2) => ({
  type: 'TaskCreated',
  occurredAt: new Date().toISOString(),
  payload: { taskId, integrationId, title: 'Test', description: null },
});

const updatedEventFor = (taskId, integrationId = 2) => ({
  type: 'TaskUpdated',
  occurredAt: new Date().toISOString(),
  payload: { taskId, integrationId, title: 'Test', description: null },
});

describe('onTaskCreated', () => {
  it('integrates an un-integrated task and persists the external id', async () => {
    const task = { id: 1, title: 'Test', integrationTaskId: null, update: mock.fn() };
    mock.method(Task, 'findByPk', async () => task);
    mock.method(stubClient, 'createTask', async () => 12345);

    await handler.onTaskCreated(eventFor(1));

    assert.strictEqual(stubClient.createTask.mock.callCount(), 1);
    assert.strictEqual(task.update.mock.callCount(), 1);
    const updateArg = task.update.mock.calls[0].arguments[0];
    assert.strictEqual(updateArg.integrationTaskId, 12345);
    assert.ok(updateArg.integrationUpdatedAt instanceof Date);
  });

  it('is idempotent: skips a task that is already integrated', async () => {
    const task = { id: 1, integrationTaskId: 999, update: mock.fn() };
    mock.method(Task, 'findByPk', async () => task);
    mock.method(stubClient, 'createTask', async () => 12345);

    await handler.onTaskCreated(eventFor(1));

    assert.strictEqual(stubClient.createTask.mock.callCount(), 0);
    assert.strictEqual(task.update.mock.callCount(), 0);
  });

  it('skips when the task no longer exists', async () => {
    mock.method(Task, 'findByPk', async () => null);
    mock.method(stubClient, 'createTask', async () => 12345);

    await handler.onTaskCreated(eventFor(999));

    assert.strictEqual(stubClient.createTask.mock.callCount(), 0);
  });
});

describe('onTaskUpdated', () => {
  it('pushes an update for an integrated task and bumps integrationUpdatedAt', async () => {
    const task = { id: 1, title: 'Test', integrationTaskId: 999, update: mock.fn() };
    mock.method(Task, 'findByPk', async () => task);
    mock.method(stubClient, 'updateTask', async () => {});

    await handler.onTaskUpdated(updatedEventFor(1));

    assert.strictEqual(stubClient.updateTask.mock.callCount(), 1);
    assert.strictEqual(task.update.mock.callCount(), 1);
    const updateArg = task.update.mock.calls[0].arguments[0];
    assert.ok(updateArg.integrationUpdatedAt instanceof Date);
  });

  it('skips a task that was never integrated', async () => {
    const task = { id: 1, integrationTaskId: null, update: mock.fn() };
    mock.method(Task, 'findByPk', async () => task);
    mock.method(stubClient, 'updateTask', async () => {});

    await handler.onTaskUpdated(updatedEventFor(1));

    assert.strictEqual(stubClient.updateTask.mock.callCount(), 0);
    assert.strictEqual(task.update.mock.callCount(), 0);
  });

  it('skips when the task no longer exists', async () => {
    mock.method(Task, 'findByPk', async () => null);
    mock.method(stubClient, 'updateTask', async () => {});

    await handler.onTaskUpdated(updatedEventFor(999));

    assert.strictEqual(stubClient.updateTask.mock.callCount(), 0);
  });
});
