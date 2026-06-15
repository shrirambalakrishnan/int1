'use strict';

const { buildEvent } = require('../integration/events');
const { Task, Board } = require('../models');
const { sendError } = require('../utils/errors');

const {
  RABBITMQ_ROUTING_KEY_TASK_CREATED,
  RABBITMQ_ROUTING_KEY_TASK_UPDATED,
  publish,
} = require('../rabbitMQ');

async function list(req, res, next) {
  try {
    const board = await Board.findByPk(req.params.boardId);
    if (!board) return res.status(404).json({ error: 'Board not found' });
    const tasks = await Task.findAll({
      where: { boardId: req.params.boardId },
    });
    res.json({ data: tasks });
  } catch (err) {
    sendError(res, next, err);
  }
}

async function get(req, res, next) {
  try {
    const task = await Task.findOne({
      where: { id: req.params.id, boardId: req.params.boardId },
    });
    if (!task) return res.status(404).json({ error: 'Not found' });
    res.json({ data: task });
  } catch (err) {
    sendError(res, next, err);
  }
}

async function create(req, res, next) {
  try {
    const board = await Board.findByPk(req.params.boardId);
    if (!board) return res.status(404).json({ error: 'Board not found' });
    const task = await Task.create({
      ...req.body,
      boardId: req.params.boardId,
    });

    const event = buildEvent('TaskCreated', {
      integrationId: board.integrationId,
      taskId: task.id,
      title: task.title,
      description: task.description,
    });
    await publish(RABBITMQ_ROUTING_KEY_TASK_CREATED, event);

    res.status(201).json({ data: task });
  } catch (err) {
    sendError(res, next, err);
  }
}

async function update(req, res, next) {
  try {
    console.log(
      'req.params.id, req.params.boardId = ',
      req.params.id,
      req.params.boardId
    );

    const task = await Task.findOne({
      where: { id: req.params.id, boardId: req.params.boardId },
    });
    if (!task) return res.status(404).json({ error: 'Not found' });
    await task.update(req.body);

    const board = await task.getBoard();
    const event = buildEvent('TaskUpdated', {
      integrationId: board.integrationId,
      taskId: task.id,
      title: task.title,
      description: task.description,
    });
    await publish(RABBITMQ_ROUTING_KEY_TASK_UPDATED, event);

    res.json({ data: task });
  } catch (err) {
    sendError(res, next, err);
  }
}

async function remove(req, res, next) {
  try {
    const task = await Task.findOne({
      where: { id: req.params.id, boardId: req.params.boardId },
    });
    if (!task) return res.status(404).json({ error: 'Not found' });
    await task.destroy();
    res.status(204).send();
  } catch (err) {
    sendError(res, next, err);
  }
}

module.exports = { list, get, create, update, remove };
