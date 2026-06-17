'use strict';

const express = require('express');

const integrationRoutes = require('./routes/integration');
const loginUserRoutes = require('./routes/loginuser');
const integrationUserRoutes = require('./routes/integrationuser');
const boardRoutes = require('./routes/board');
const commentRoutes = require('./routes/comment');
const webhookRoutes = require('./routes/webhook');
const oauthRoutes = require('./routes/oauth');

const app = express();

// Before express.json(): webhook signatures are verified over the raw body,
// so the webhook router does its own (raw) body parsing.
app.use('/webhooks', webhookRoutes);

app.use(express.json());

app.use('/integrations', integrationRoutes);
app.use('/login-users', loginUserRoutes);
app.use('/integration-users', integrationUserRoutes);
app.use('/boards', boardRoutes);
app.use('/tasks', commentRoutes);
app.use('/oauth', oauthRoutes);

app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Malformed JSON in request body' });
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
