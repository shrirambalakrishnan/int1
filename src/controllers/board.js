'use strict';

const { buildEvent } = require('../integration/events');
const { Board } = require('../models');
const { sendError } = require('../utils/errors');
const {
  RABBITMQ_ROUTING_KEY_BOARD_CREATED,
  RABBITMQ_ROUTING_KEY_BOARD_UPDATED,
  publish,
} = require('../rabbitMQ');

async function list(req, res, next) {
  try {
    const boards = await Board.findAll();
    res.json({ data: boards });
  } catch (err) {
    sendError(res, next, err);
  }
}

async function get(req, res, next) {
  try {
    const board = await Board.findByPk(req.params.id);
    if (!board) return res.status(404).json({ error: 'Not found' });
    res.json({ data: board });
  } catch (err) {
    sendError(res, next, err);
  }
}

async function create(req, res, next) {
  try {
    const board = await Board.create(req.body);

    const event = buildEvent('BoardCreated', {
      boardId: board.id,
    });

    await publish(RABBITMQ_ROUTING_KEY_BOARD_CREATED, event);

    res.status(201).json({ data: board });
  } catch (err) {
    sendError(res, next, err);
  }
}

async function update(req, res, next) {
  try {
    const board = await Board.findByPk(req.params.id);
    if (!board) return res.status(404).json({ error: 'Not found' });
    await board.update(req.body);

    const event = buildEvent('BoardUpdated', {
      boardId: board.id,
      integrationId: board.integrationId,
    });
    await publish(RABBITMQ_ROUTING_KEY_BOARD_UPDATED, event);

    res.json({ data: board });
  } catch (err) {
    sendError(res, next, err);
  }
}

async function remove(req, res, next) {
  try {
    const board = await Board.findByPk(req.params.id);
    if (!board) return res.status(404).json({ error: 'Not found' });
    await board.destroy();
    res.status(204).send();
  } catch (err) {
    sendError(res, next, err);
  }
}

module.exports = { list, get, create, update, remove };
