'use strict';

const { describe, it, mock, afterEach } = require('node:test');
const assert = require('node:assert');

const asanaClient = require('../clients/asanaClient');
const { translateAsanaWebhookEvent } = require('./asanaWebhookTranslator');

afterEach(() => mock.restoreAll());

const user = { gid: '5550001', resource_type: 'user' };

describe('translateAsanaWebhookEvent', () => {
  it('returns null for a (resource, action) pair it does not translate', async () => {
    const event = await translateAsanaWebhookEvent(
      {
        user,
        resource: { gid: '1', resource_type: 'task' },
        action: 'deleted',
      },
      3
    );
    assert.strictEqual(event, null);
  });

  it('translates project changed into ExternalBoardUpdated, fetching the project', async () => {
    mock.method(asanaClient, 'getProject', async () => ({
      gid: '120001',
      name: 'Remote board',
    }));

    const event = await translateAsanaWebhookEvent(
      {
        user,
        resource: { gid: '120001', resource_type: 'project' },
        action: 'changed',
      },
      3
    );

    assert.strictEqual(event.type, 'ExternalBoardUpdated');
    assert.deepStrictEqual(event.payload, {
      integrationId: 3,
      externalBoardId: '120001',
      name: 'Remote board',
      actor: { externalUserId: '5550001', username: null, email: null },
    });
  });

  it('translates task added into ExternalTaskCreated with the parent project gid', async () => {
    mock.method(asanaClient, 'getTask', async () => ({
      gid: '130001',
      name: 'Remote task',
      notes: 'details',
      projects: [{ gid: '120001' }],
    }));

    const event = await translateAsanaWebhookEvent(
      {
        user,
        resource: { gid: '130001', resource_type: 'task' },
        action: 'added',
      },
      3
    );

    assert.strictEqual(event.type, 'ExternalTaskCreated');
    assert.strictEqual(event.payload.externalBoardId, '120001');
    assert.strictEqual(event.payload.externalTaskId, '130001');
    assert.strictEqual(event.payload.title, 'Remote task');
    assert.strictEqual(event.payload.description, 'details');
  });

  it('returns null for task added when the task no longer has a project', async () => {
    mock.method(asanaClient, 'getTask', async () => ({
      gid: '130001',
      name: 'Orphaned',
      notes: '',
      projects: [],
    }));

    const event = await translateAsanaWebhookEvent(
      {
        user,
        resource: { gid: '130001', resource_type: 'task' },
        action: 'added',
      },
      3
    );
    assert.strictEqual(event, null);
  });

  it('translates task changed into ExternalTaskUpdated with a null actor when absent', async () => {
    mock.method(asanaClient, 'getTask', async () => ({
      gid: '130001',
      name: 'Edited',
      notes: '',
      projects: [{ gid: '120001' }],
    }));

    const event = await translateAsanaWebhookEvent(
      { resource: { gid: '130001', resource_type: 'task' }, action: 'changed' },
      3
    );

    assert.strictEqual(event.type, 'ExternalTaskUpdated');
    // Empty notes normalize to null (the canonical nullable column).
    assert.strictEqual(event.payload.description, null);
    assert.strictEqual(event.payload.actor, null);
    assert.strictEqual(event.payload.externalBoardId, undefined);
  });

  it('translates a comment story added into ExternalCommentCreated, fetching the story', async () => {
    mock.method(asanaClient, 'getStory', async () => ({
      gid: '140001',
      text: 'remote comment',
      resource_subtype: 'comment_added',
      target: { gid: '130001' },
    }));

    const event = await translateAsanaWebhookEvent(
      {
        user,
        resource: {
          gid: '140001',
          resource_type: 'story',
          resource_subtype: 'comment_added',
        },
        action: 'added',
      },
      3
    );

    assert.strictEqual(event.type, 'ExternalCommentCreated');
    assert.strictEqual(event.payload.externalCommentId, '140001');
    assert.strictEqual(event.payload.externalTaskId, '130001');
    assert.strictEqual(event.payload.content, 'remote comment');
  });

  it('ignores system stories without an API call', async () => {
    const getStory = mock.method(asanaClient, 'getStory', async () => {
      throw new Error('should not be called');
    });

    const event = await translateAsanaWebhookEvent(
      {
        user,
        resource: {
          gid: '140002',
          resource_type: 'story',
          resource_subtype: 'added_to_project',
        },
        action: 'added',
      },
      3
    );

    assert.strictEqual(event, null);
    assert.strictEqual(getStory.mock.callCount(), 0);
  });

  it('translates a comment story changed into ExternalCommentUpdated without a task id', async () => {
    mock.method(asanaClient, 'getStory', async () => ({
      gid: '140001',
      text: 'edited comment',
      resource_subtype: 'comment_added',
      target: { gid: '130001' },
    }));

    const event = await translateAsanaWebhookEvent(
      {
        user,
        resource: {
          gid: '140001',
          resource_type: 'story',
          resource_subtype: 'comment_added',
        },
        action: 'changed',
      },
      3
    );

    assert.strictEqual(event.type, 'ExternalCommentUpdated');
    assert.strictEqual(event.payload.externalCommentId, '140001');
    assert.strictEqual(event.payload.content, 'edited comment');
    assert.strictEqual(event.payload.externalTaskId, undefined);
  });
});
