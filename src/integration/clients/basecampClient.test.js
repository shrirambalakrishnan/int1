'use strict';

const { describe, it, mock, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');

const { createBasecampClient } = require('./basecampClient');

// Minimal stand-in for a fetch Response; only what the request core touches.
const fakeRes = ({ status = 200, body = '{}' } = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: () => null },
  text: async () => body,
});

const authStrategy = { getAuthHeaders: async () => ({ Authorization: 'Bearer at' }) };

const client = (overrides = {}) =>
  createBasecampClient({
    accountId: 'acc1',
    projectId: 'proj1',
    todosetId: 'set1',
    authStrategy,
    ...overrides,
  });

// Each test queues the fetch responses it expects, in order.
let responses;
beforeEach(() => {
  responses = [];
  mock.method(globalThis, 'fetch', async () => responses.shift());
});
afterEach(() => mock.restoreAll());

const lastCall = () => globalThis.fetch.mock.calls.at(-1).arguments;
const callAt = (i) => globalThis.fetch.mock.calls[i].arguments;

describe('basecampClient', () => {
  it('createBoard posts a todolist into the pinned todoset and returns its id', async () => {
    responses.push(fakeRes({ status: 201, body: '{"id":98765}' }));

    const id = await client().createBoard({ id: 1, name: 'Launch' });

    assert.strictEqual(id, '98765');
    const [url, init] = lastCall();
    assert.strictEqual(url, 'https://3.basecampapi.com/acc1/todosets/set1/todolists.json');
    assert.strictEqual(init.method, 'POST');
    assert.deepStrictEqual(JSON.parse(init.body), { name: 'Launch' });
    assert.strictEqual(init.headers['User-Agent'], 'int1 (http://localhost:3000)');
  });

  it('createBoard resolves the todoset from the project dock when not pinned', async () => {
    responses.push(
      fakeRes({ body: '{"dock":[{"name":"message_board","id":1},{"name":"todoset","id":555}]}' })
    );
    responses.push(fakeRes({ status: 201, body: '{"id":42}' }));

    const id = await client({ todosetId: undefined }).createBoard({ id: 1, name: 'B' });

    assert.strictEqual(id, '42');
    assert.strictEqual(callAt(0)[0], 'https://3.basecampapi.com/acc1/projects/proj1.json');
    assert.strictEqual(callAt(1)[0], 'https://3.basecampapi.com/acc1/todosets/555/todolists.json');
  });

  it('createBoard throws when the project has no todoset in its dock', async () => {
    responses.push(fakeRes({ body: '{"dock":[{"name":"message_board","id":1}]}' }));

    await assert.rejects(
      client({ todosetId: undefined }).createBoard({ id: 1, name: 'B' }),
      /no todoset in its dock/
    );
  });

  it('updateBoard puts the new name to the todolist', async () => {
    responses.push(fakeRes());

    await client().updateBoard({ id: 1, name: 'Renamed', integrationBoardId: '777' });

    const [url, init] = lastCall();
    assert.strictEqual(url, 'https://3.basecampapi.com/acc1/todolists/777.json');
    assert.strictEqual(init.method, 'PUT');
    assert.deepStrictEqual(JSON.parse(init.body), { name: 'Renamed' });
  });

  it('createTask posts a todo into the board with content and description', async () => {
    responses.push(fakeRes({ status: 201, body: '{"id":314}' }));

    const id = await client().createTask(
      { id: 2, title: 'Do it', description: 'details' },
      { integrationBoardId: '777' }
    );

    assert.strictEqual(id, '314');
    const [url, init] = lastCall();
    assert.strictEqual(url, 'https://3.basecampapi.com/acc1/todolists/777/todos.json');
    assert.deepStrictEqual(JSON.parse(init.body), { content: 'Do it', description: 'details' });
  });

  it('createTask omits description when the task has none', async () => {
    responses.push(fakeRes({ status: 201, body: '{"id":1}' }));

    await client().createTask({ id: 2, title: 'Do it', description: null }, { integrationBoardId: '777' });

    assert.deepStrictEqual(JSON.parse(lastCall()[1].body), { content: 'Do it' });
  });

  it('updateTask always sends content and description (PUT-clobber quirk)', async () => {
    responses.push(fakeRes());

    await client().updateTask({ id: 2, title: 'New title', description: null, integrationTaskId: '314' });

    const [url, init] = lastCall();
    assert.strictEqual(url, 'https://3.basecampapi.com/acc1/todos/314.json');
    assert.strictEqual(init.method, 'PUT');
    assert.deepStrictEqual(JSON.parse(init.body), { content: 'New title', description: '' });
  });

  it('createComment posts to the todo recording and returns the comment id', async () => {
    responses.push(fakeRes({ status: 201, body: '{"id":900}' }));

    const id = await client().createComment(
      { id: 3, content: 'nice' },
      { integrationTaskId: '314' }
    );

    assert.strictEqual(id, '900');
    const [url, init] = lastCall();
    assert.strictEqual(url, 'https://3.basecampapi.com/acc1/recordings/314/comments.json');
    assert.deepStrictEqual(JSON.parse(init.body), { content: 'nice' });
  });

  it('updateComment puts the new content to the comment', async () => {
    responses.push(fakeRes());

    await client().updateComment({ id: 3, content: 'edited', integrationCommentId: '900' });

    const [url, init] = lastCall();
    assert.strictEqual(url, 'https://3.basecampapi.com/acc1/comments/900.json');
    assert.strictEqual(init.method, 'PUT');
    assert.deepStrictEqual(JSON.parse(init.body), { content: 'edited' });
  });
});
