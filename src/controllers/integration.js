'use strict';

const { Integration } = require('../models');
const { sendError } = require('../utils/errors');

async function list(req, res, next) {
  try {
    const integrations = await Integration.findAll();
    res.json({ data: integrations });
  } catch (err) {
    sendError(res, next, err);
  }
}

async function get(req, res, next) {
  try {
    const integration = await Integration.findByPk(req.params.id);
    if (!integration) return res.status(404).json({ error: 'Not found' });
    res.json({ data: integration });
  } catch (err) {
    sendError(res, next, err);
  }
}

async function create(req, res, next) {
  try {
    const integration = await Integration.create(req.body);
    res.status(201).json({ data: integration });
  } catch (err) {
    sendError(res, next, err);
  }
}

async function update(req, res, next) {
  try {
    const integration = await Integration.findByPk(req.params.id);
    if (!integration) return res.status(404).json({ error: 'Not found' });
    await integration.update(req.body);
    res.json({ data: integration });
  } catch (err) {
    sendError(res, next, err);
  }
}

async function remove(req, res, next) {
  try {
    const integration = await Integration.findByPk(req.params.id);
    if (!integration) return res.status(404).json({ error: 'Not found' });
    await integration.destroy();
    res.status(204).send();
  } catch (err) {
    sendError(res, next, err);
  }
}

module.exports = { list, get, create, update, remove };
