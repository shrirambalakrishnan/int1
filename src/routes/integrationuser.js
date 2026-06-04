'use strict';

const { Router } = require('express');
const controller = require('../controllers/integrationuser');

const router = Router();

router.get('/', controller.list);
router.get('/:id', controller.get);
router.post('/', controller.create);
router.put('/:id', controller.update);
router.delete('/:id', controller.remove);

module.exports = router;
