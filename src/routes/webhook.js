'use strict';

const express = require('express');
const { Router } = require('express');
const controller = require('../controllers/webhook');

const router = Router();

// Raw body, not JSON: the controller verifies the HMAC signature over the
// exact bytes ClickUp signed. This router is mounted before the app-wide
// express.json() so nothing parses the body first.
router.post(
  '/clickup',
  express.raw({ type: 'application/json' }),
  controller.clickup
);

module.exports = router;
