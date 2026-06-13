'use strict';

const { describe, it, mock, afterEach } = require('node:test');
const assert = require('node:assert');

const trelloClient = require('../clients/trelloClient');
const { translateTrelloWebhook } = require('./trelloWebhookTranslator');

afterEach(() => mock.restoreAll());

const memberCreator = { id: 'a1b2c3', username: 'ext-user' };

// Trello deliveries are a single { model, action }; the model is unused.
function delivery(action) {
  return { model: {}, action };
}

describe('translateTrelloWebhook', () => {
  it('returns null for an action type it does not translate', async () => {
    const event = await translateTrelloWebhook(
      delivery({ type: 'updateBoard', idMemberCreator: 'a1b2c3' }),
      2
    );
    assert.strictEqual(event, null);
  });

  it('translates createList into ExternalBoardCreated, fetching the list', async () => {
    mock.method(trelloClient, 'getList', async () => ({
      id: 'list24hex',
      name: 'Remote board',
    }));

    const event = await translateTrelloWebhook(
      delivery({
        type: 'createList',
        idMemberCreator: 'a1b2c3',
        memberCreator,
        data: { list: { id: 'list24hex' } },
      }),
      2
    );

    assert.strictEqual(event.type, 'ExternalBoardCreated');
    assert.deepStrictEqual(event.payload, {
      integrationId: 2,
      externalBoardId: 'list24hex',
      name: 'Remote board',
      actor: { externalUserId: 'a1b2c3', username: 'ext-user', email: null },
    });
  });

  it('translates createCard into ExternalTaskCreated with the parent list id', async () => {
    mock.method(trelloClient, 'getCard', async () => ({
      id: 'card24hex',
      name: 'Remote task',
      desc: 'details',
      idList: 'list24hex',
    }));

    const event = await translateTrelloWebhook(
      delivery({
        type: 'createCard',
        idMemberCreator: 'a1b2c3',
        memberCreator,
        data: { card: { id: 'card24hex' }, list: { id: 'list24hex' } },
      }),
      2
    );

    assert.strictEqual(event.type, 'ExternalTaskCreated');
    assert.strictEqual(event.payload.externalBoardId, 'list24hex');
    assert.strictEqual(event.payload.externalTaskId, 'card24hex');
    assert.strictEqual(event.payload.title, 'Remote task');
    assert.strictEqual(event.payload.description, 'details');
  });

  it('translates updateCard into ExternalTaskUpdated with a null actor when absent and empty desc->null', async () => {
    mock.method(trelloClient, 'getCard', async () => ({
      id: 'card24hex',
      name: 'Edited',
      desc: '',
      idList: 'list24hex',
    }));

    const event = await translateTrelloWebhook(
      delivery({ type: 'updateCard', data: { card: { id: 'card24hex' } } }),
      2
    );

    assert.strictEqual(event.type, 'ExternalTaskUpdated');
    // Empty description normalizes to null (the canonical nullable column).
    assert.strictEqual(event.payload.description, null);
    assert.strictEqual(event.payload.actor, null);
    assert.strictEqual(event.payload.externalBoardId, undefined);
  });

  it('translates commentCard into ExternalCommentCreated, taking the id from the action and content from the API', async () => {
    mock.method(trelloClient, 'getCommentAction', async () => ({
      id: 'comment24hex',
      data: { text: 'remote comment', card: { id: 'card24hex' } },
    }));

    const event = await translateTrelloWebhook(
      delivery({
        type: 'commentCard',
        id: 'comment24hex',
        idMemberCreator: 'a1b2c3',
        memberCreator,
        data: { card: { id: 'card24hex' }, text: 'remote comment' },
      }),
      2
    );

    assert.strictEqual(event.type, 'ExternalCommentCreated');
    assert.strictEqual(event.payload.externalCommentId, 'comment24hex');
    assert.strictEqual(event.payload.externalTaskId, 'card24hex');
    assert.strictEqual(event.payload.content, 'remote comment');
  });

  it('translates updateComment into ExternalCommentUpdated, resolving the original comment action id', async () => {
    mock.method(trelloClient, 'getCommentAction', async () => ({
      id: 'comment24hex',
      data: { text: 'edited comment', card: { id: 'card24hex' } },
    }));

    const event = await translateTrelloWebhook(
      delivery({
        type: 'updateComment',
        idMemberCreator: 'a1b2c3',
        memberCreator,
        data: { action: { id: 'comment24hex' }, card: { id: 'card24hex' } },
      }),
      2
    );

    assert.strictEqual(event.type, 'ExternalCommentUpdated');
    assert.strictEqual(event.payload.externalCommentId, 'comment24hex');
    assert.strictEqual(event.payload.content, 'edited comment');
  });

  it('returns null when an updateComment is missing the original comment action id', async () => {
    const event = await translateTrelloWebhook(
      delivery({ type: 'updateComment', data: {} }),
      2
    );
    assert.strictEqual(event, null);
  });
});
