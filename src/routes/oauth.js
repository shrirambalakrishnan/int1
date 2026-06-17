'use strict';

const { Router } = require('express');
const controller = require('../controllers/oauth');

const router = Router();

// GET so the admin can hit it from a browser/curl to obtain the consent URL.
// The provider-specific callback (Task 6) is added here as /basecamp/callback.
router.get('/basecamp/connect', controller.connectBasecamp);

module.exports = router;
