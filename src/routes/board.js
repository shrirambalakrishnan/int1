'use strict';

const { Router } = require('express');
const controller = require('../controllers/board');
const taskController = require('../controllers/task');

const router = Router();

router.get('/', controller.list);
router.get('/:id', controller.get);
router.post('/', controller.create);
router.put('/:id', controller.update);
router.delete('/:id', controller.remove);

router.get('/:boardId/tasks', taskController.list);
router.get('/:boardId/tasks/:id', taskController.get);
router.post('/:boardId/tasks', taskController.create);
router.put('/:boardId/tasks/:id', taskController.update);
router.delete('/:boardId/tasks/:id', taskController.remove);

module.exports = router;
