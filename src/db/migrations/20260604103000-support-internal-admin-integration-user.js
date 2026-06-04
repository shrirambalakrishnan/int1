'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Internal admins have no external integration.
    await queryInterface.changeColumn('IntegrationUsers', 'integrationId', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });

    // Each admin (loginUserId) maps to at most one IntegrationUser.
    // Partial index so it only applies to admin rows, leaving external
    // users (loginUserId IS NULL) unaffected.
    await queryInterface.addIndex('IntegrationUsers', ['loginUserId'], {
      unique: true,
      name: 'integration_users_login_user_id_unique',
      where: { loginUserId: { [Sequelize.Op.ne]: null } },
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeIndex(
      'IntegrationUsers',
      'integration_users_login_user_id_unique'
    );
    await queryInterface.changeColumn('IntegrationUsers', 'integrationId', {
      type: Sequelize.INTEGER,
      allowNull: false,
    });
  },
};
