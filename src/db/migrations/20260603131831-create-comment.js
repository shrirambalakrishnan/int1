'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Comments', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      taskId: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      content: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      createdByIntegrationUserId: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      integrationCommentId: {
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

    await queryInterface.addIndex(
      'Comments',
      ['taskId', 'integrationCommentId'],
      {
        unique: true,
        name: 'comments_task_id_integration_comment_id_unique',
      }
    );
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('Comments');
  },
};

// Comment model

// id
// taskId
// content
// createdAt
// updatedAt
// createdByIntegrationUserId
// integrationCommentId
// integrationUpdatedAt
// Index
// Uniq on (taskId, integrationCommentId)
