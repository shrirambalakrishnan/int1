'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Tasks', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      title: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
      },
      description: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      boardId: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      integrationTaskId: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      createdByIntegrationUserId: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      integrationUserIdAssigned: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      integrationUpdatedAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
      },
    });

    await queryInterface.addIndex('Tasks', ['boardId', 'integrationTaskId'], {
      unique: true,
      name: 'tasks_board_id_integration_task_id_unique',
    });
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('Tasks');
  },
};
