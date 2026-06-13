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

// type: '*/*' — Asana's handshake POST has no body, and express.raw only
// produces a Buffer when the Content-Type matches; the controller must still
// run to echo X-Hook-Secret.
router.post('/asana', express.raw({ type: '*/*' }), controller.asana);

module.exports = router;
