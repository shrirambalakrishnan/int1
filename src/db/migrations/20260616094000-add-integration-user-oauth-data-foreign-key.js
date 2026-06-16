'use strict';

/**
 * Foreign key for IntegrationUserOAuthData.integrationUserId, its own migration
 * because createTable ignores inline references. ON DELETE CASCADE so deleting
 * an IntegrationUser removes its stored tokens — cascade is enforced here in
 * the DB and again via the hasOne association hooks in the models (see
 * CLAUDE.md "Cascade deletes are enforced in both layers on purpose").
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.addConstraint('IntegrationUserOAuthData', {
      fields: ['integrationUserId'],
      type: 'foreign key',
      name: 'integration_user_oauth_data_integration_user_id_fkey',
      references: { table: 'IntegrationUsers', field: 'id' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeConstraint(
      'IntegrationUserOAuthData',
      'integration_user_oauth_data_integration_user_id_fkey'
    );
  },
};
