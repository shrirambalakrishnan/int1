'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addConstraint('Boards', {
      fields: ['integrationId'],
      type: 'foreign key',
      name: 'boards_integration_id_fkey',
      references: { table: 'Integrations', field: 'id' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    });

    await queryInterface.addConstraint('Tasks', {
      fields: ['boardId'],
      type: 'foreign key',
      name: 'tasks_board_id_fkey',
      references: { table: 'Boards', field: 'id' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    });

    await queryInterface.addConstraint('Comments', {
      fields: ['taskId'],
      type: 'foreign key',
      name: 'comments_task_id_fkey',
      references: { table: 'Tasks', field: 'id' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeConstraint('Comments', 'comments_task_id_fkey');
    await queryInterface.removeConstraint('Tasks', 'tasks_board_id_fkey');
    await queryInterface.removeConstraint('Boards', 'boards_integration_id_fkey');
  },
};
