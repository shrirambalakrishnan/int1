'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Boards', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      integrationBoardId: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      integrationId: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      createdByIntegrationUserId: {
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
      'Boards',
      ['integrationId', 'integrationBoardId'],
      {
        unique: true,
        name: 'boards_integration_id_integration_board_id_unique',
      }
    );
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('Boards');
  },
};
