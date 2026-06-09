'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');

const { buildEvent, validateEvent } = require('./index');

describe('buildEvent', () => {
  it('produces a valid BoardCreated envelope with stamped metadata', () => {
    const event = buildEvent('BoardCreated', { integrationId: 2, boardId: 1 });

    assert.strictEqual(event.type, 'BoardCreated');
    assert.ok(!Number.isNaN(Date.parse(event.occurredAt)));
    assert.deepStrictEqual(event.payload, { integrationId: 2, boardId: 1 });
  });

  it('produces a valid BoardUpdated envelope', () => {
    const event = buildEvent('BoardUpdated', { integrationId: 2, boardId: 1 });

    assert.strictEqual(event.type, 'BoardUpdated');
    assert.ok(!Number.isNaN(Date.parse(event.occurredAt)));
    assert.deepStrictEqual(event.payload, { integrationId: 2, boardId: 1 });
  });

  it('produces a valid TaskCreated envelope', () => {
    const payload = { integrationId: 2, taskId: 1, title: 'Ship it', description: 'soon' };
    const event = buildEvent('TaskCreated', payload);

    assert.strictEqual(event.type, 'TaskCreated');
    assert.ok(!Number.isNaN(Date.parse(event.occurredAt)));
    assert.deepStrictEqual(event.payload, payload);
  });

  it('produces a valid TaskUpdated envelope', () => {
    const payload = { integrationId: 2, taskId: 1, title: 'Ship it', description: 'soon' };
    const event = buildEvent('TaskUpdated', payload);

    assert.strictEqual(event.type, 'TaskUpdated');
    assert.ok(!Number.isNaN(Date.parse(event.occurredAt)));
    assert.deepStrictEqual(event.payload, payload);
  });

  it('accepts a TaskCreated with a null description', () => {
    const payload = { integrationId: 2, taskId: 1, title: 'Ship it', description: null };
    assert.deepStrictEqual(buildEvent('TaskCreated', payload).payload, payload);
  });

  it('throws when a required BoardCreated payload field is missing', () => {
    assert.throws(
      () => buildEvent('BoardCreated', { integrationId: 2 }), // no boardId
      /Invalid BoardCreated event/
    );
  });

  it('throws when a required BoardUpdated payload field is missing', () => {
    assert.throws(
      () => buildEvent('BoardUpdated', { integrationId: 2 }), // no boardId
      /Invalid BoardUpdated event/
    );
  });

  it('throws when a required TaskCreated payload field is missing', () => {
    assert.throws(
      () => buildEvent('TaskCreated', { integrationId: 2 }), // no taskId
      /Invalid TaskCreated event/
    );
  });

  it('throws when TaskCreated is missing its title', () => {
    assert.throws(
      () => buildEvent('TaskCreated', { integrationId: 2, taskId: 1 }), // no title
      /Invalid TaskCreated event/
    );
  });

  it('throws on an unknown event type', () => {
    assert.throws(() => buildEvent('Nope', {}), /unknown event type: Nope/);
  });
});

describe('validateEvent', () => {
  it('accepts a well-formed BoardCreated event and returns it', () => {
    const good = buildEvent('BoardCreated', { integrationId: 2, boardId: 1 });
    assert.deepStrictEqual(validateEvent(good), good);
  });

  it('accepts a well-formed BoardUpdated event and returns it', () => {
    const good = buildEvent('BoardUpdated', { integrationId: 2, boardId: 1 });
    assert.deepStrictEqual(validateEvent(good), good);
  });

  it('accepts a well-formed TaskCreated event and returns it', () => {
    const good = buildEvent('TaskCreated', { integrationId: 2, taskId: 1, title: 'X' });
    assert.deepStrictEqual(validateEvent(good), good);
  });

  it('accepts a well-formed TaskUpdated event and returns it', () => {
    const good = buildEvent('TaskUpdated', { integrationId: 2, taskId: 1, title: 'X' });
    assert.deepStrictEqual(validateEvent(good), good);
  });

  it('throws on a bad payload type', () => {
    const bad = {
      type: 'BoardCreated',
      occurredAt: new Date().toISOString(),
      payload: { integrationId: 2, boardId: 'not-a-number' },
    };
    assert.throws(() => validateEvent(bad), /Invalid BoardCreated event/);
  });

  it('throws when type is missing', () => {
    assert.throws(() => validateEvent({ payload: {} }), /missing a string `type`/);
  });

  it('throws on an unknown event type', () => {
    assert.throws(
      () => validateEvent({ type: 'Mystery', payload: {} }),
      /No schema for event type: Mystery/
    );
  });
});
