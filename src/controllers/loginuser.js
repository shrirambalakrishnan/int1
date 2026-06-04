'use strict';

const { LoginUser } = require('../models');
const { sendError } = require('../utils/errors');

async function list(req, res, next) {
  try {
    const users = await LoginUser.findAll();
    res.json({ data: users });
  } catch (err) {
    sendError(res, next, err);
  }
}

async function get(req, res, next) {
  try {
    const user = await LoginUser.findByPk(req.params.id);
    if (!user) return res.status(404).json({ error: 'Not found' });
    res.json({ data: user });
  } catch (err) {
    sendError(res, next, err);
  }
}

async function create(req, res, next) {
  try {
    const user = await LoginUser.create(req.body);
    res.status(201).json({ data: user });
  } catch (err) {
    sendError(res, next, err);
  }
}

async function update(req, res, next) {
  try {
    const user = await LoginUser.findByPk(req.params.id);
    if (!user) return res.status(404).json({ error: 'Not found' });
    await user.update(req.body);
    res.json({ data: user });
  } catch (err) {
    sendError(res, next, err);
  }
}

async function remove(req, res, next) {
  try {
    const user = await LoginUser.findByPk(req.params.id);
    if (!user) return res.status(404).json({ error: 'Not found' });
    await user.destroy();
    res.status(204).send();
  } catch (err) {
    sendError(res, next, err);
  }
}

module.exports = { list, get, create, update, remove };
