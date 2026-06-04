'use strict';

const { Router } = require('express');
const controller = require('../controllers/comment');

const router = Router({ mergeParams: true });

router.get('/:taskId/comments', controller.list);
router.get('/:taskId/comments/:id', controller.get);
router.post('/:taskId/comments', controller.create);
router.put('/:taskId/comments/:id', controller.update);
router.delete('/:taskId/comments/:id', controller.remove);

module.exports = router;
