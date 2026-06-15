'use strict';

const { buildEvent } = require('../integration/events');
const { Comment, Task } = require('../models');
const { sendError } = require('../utils/errors');

const {
  RABBITMQ_ROUTING_KEY_TASK_CREATED,
  RABBITMQ_ROUTING_KEY_TASK_UPDATED,
  publish,
  RABBITMQ_ROUTING_KEY_COMMENT_CREATED,
  RABBITMQ_ROUTING_KEY_COMMENT_UPDATED,
} = require('../rabbitMQ');

async function list(req, res, next) {
  try {
    const task = await Task.findByPk(req.params.taskId);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    const comments = await Comment.findAll({
      where: { taskId: req.params.taskId },
    });
    res.json({ data: comments });
  } catch (err) {
    sendError(res, next, err);
  }
}

async function get(req, res, next) {
  try {
    const comment = await Comment.findOne({
      where: { id: req.params.id, taskId: req.params.taskId },
    });
    if (!comment) return res.status(404).json({ error: 'Not found' });
    res.json({ data: comment });
  } catch (err) {
    sendError(res, next, err);
  }
}

async function create(req, res, next) {
  try {
    const task = await Task.findByPk(req.params.taskId);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    const comment = await Comment.create({
      ...req.body,
      taskId: req.params.taskId,
    });

    const event = buildEvent('CommentCreated', {
      commentId: comment.id,
      content: comment.content,
    });
    await publish(RABBITMQ_ROUTING_KEY_COMMENT_CREATED, event);

    res.status(201).json({ data: comment });
  } catch (err) {
    sendError(res, next, err);
  }
}

async function update(req, res, next) {
  try {
    const comment = await Comment.findOne({
      where: { id: req.params.id, taskId: req.params.taskId },
    });
    if (!comment) return res.status(404).json({ error: 'Not found' });
    await comment.update(req.body);

    const event = buildEvent('CommentUpdated', {
      integrationId: comment.integrationId,
      commentId: comment.id,
      content: comment.content,
    });
    await publish(RABBITMQ_ROUTING_KEY_COMMENT_UPDATED, event);

    res.json({ data: comment });
  } catch (err) {
    sendError(res, next, err);
  }
}

async function remove(req, res, next) {
  try {
    const comment = await Comment.findOne({
      where: { id: req.params.id, taskId: req.params.taskId },
    });
    if (!comment) return res.status(404).json({ error: 'Not found' });
    await comment.destroy();
    res.status(204).send();
  } catch (err) {
    sendError(res, next, err);
  }
}

module.exports = { list, get, create, update, remove };
