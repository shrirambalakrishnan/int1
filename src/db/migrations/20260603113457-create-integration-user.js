'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'IntegrationUsers',
      {
        id: {
          allowNull: false,
          autoIncrement: true,
          primaryKey: true,
          type: Sequelize.INTEGER,
        },
        integrationId: {
          type: Sequelize.INTEGER,
          allowNull: false,
        },
        externalUserId: {
          type: Sequelize.INTEGER,
          allowNull: false,
        },
        loginUserId: {
          type: Sequelize.INTEGER,
          allowNull: true,
        },
        integrationUserName: {
          type: Sequelize.STRING,
          allowNull: true,
        },
        integrationUserEmail: {
          type: Sequelize.STRING,
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
      },
    );
    await queryInterface.addIndex('IntegrationUsers', ['integrationId', 'externalUserId'], {
      unique: true,
      name: 'integration_users_integration_id_external_user_id_unique',
    });
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('IntegrationUsers');
  },
};
