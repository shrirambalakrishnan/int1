'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addConstraint('IntegrationUsers', {
      fields: ['integrationId'],
      type: 'foreign key',
      name: 'integration_users_integration_id_fkey',
      references: { table: 'Integrations', field: 'id' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    });

    await queryInterface.addConstraint('IntegrationUsers', {
      fields: ['loginUserId'],
      type: 'foreign key',
      name: 'integration_users_login_user_id_fkey',
      references: { table: 'LoginUsers', field: 'id' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeConstraint(
      'IntegrationUsers',
      'integration_users_login_user_id_fkey'
    );
    await queryInterface.removeConstraint(
      'IntegrationUsers',
      'integration_users_integration_id_fkey'
    );
  },
};
