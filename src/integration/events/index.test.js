'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const { buildEvent, validateEvent } = require('./index');

test('buildEvent produces a valid envelope with stamped metadata', () => {
  const event = buildEvent('BoardCreated', { integrationId: 2, boardId: 1 });

  assert.strictEqual(event.type, 'BoardCreated');
  assert.ok(!Number.isNaN(Date.parse(event.occurredAt)));
  assert.deepStrictEqual(event.payload, { integrationId: 2, boardId: 1 });
});

test('buildEvent throws when a required payload field is missing', () => {
  assert.throws(
    () => buildEvent('BoardCreated', { integrationId: 2 }), // no boardId
    /Invalid BoardCreated event/
  );
});

test('buildEvent throws on an unknown event type', () => {
  assert.throws(() => buildEvent('Nope', {}), /unknown event type: Nope/);
});

test('validateEvent accepts a well-formed event and returns it', () => {
  const good = buildEvent('BoardCreated', { integrationId: 2, boardId: 1 });
  const validated = validateEvent(good);
  assert.deepStrictEqual(validated, good);
});

test('validateEvent throws on a bad payload type', () => {
  const bad = {
    type: 'BoardCreated',
    occurredAt: new Date().toISOString(),
    payload: { integrationId: 2, boardId: 'not-a-number' },
  };
  assert.throws(() => validateEvent(bad), /Invalid BoardCreated event/);
});

test('validateEvent throws when type is missing', () => {
  assert.throws(() => validateEvent({ payload: {} }), /missing a string `type`/);
});

test('validateEvent throws on an unknown event type', () => {
  assert.throws(
    () => validateEvent({ type: 'Mystery', payload: {} }),
    /No schema for event type: Mystery/
  );
});
