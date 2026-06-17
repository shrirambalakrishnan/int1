'use strict';

const { Router } = require('express');
const controller = require('../controllers/oauth');

const router = Router();

// GET so the admin can hit it from a browser/curl to obtain the consent URL.
router.get('/basecamp/connect', controller.connectBasecamp);

// Where Basecamp redirects the browser after consent, with ?code= (or ?error=).
// GET — it's a browser redirect target, not a programmatic POST.
router.get('/basecamp/callback', controller.callbackBasecamp);

module.exports = router;
