'use strict';

/**
 * Unique index on IntegrationUserOAuthData.integrationUserId — its own
 * migration because createTable ignores inline indexes. The relationship is
 * 1:1 (one token set per actor), so the FK column is unique; modeled as
 * IntegrationUser.hasOne(IntegrationUserOAuthData). Re-authorizing overwrites
 * the single row rather than accumulating history.
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.addIndex(
      'IntegrationUserOAuthData',
      ['integrationUserId'],
      {
        unique: true,
        name: 'integration_user_oauth_data_integration_user_id_unique',
      }
    );
  },

  async down(queryInterface) {
    await queryInterface.removeIndex(
      'IntegrationUserOAuthData',
      'integration_user_oauth_data_integration_user_id_unique'
    );
  },
};
