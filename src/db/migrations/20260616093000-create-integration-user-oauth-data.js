'use strict';

/**
 * Stores the OAuth2 token set obtained for an IntegrationUser (issue #27,
 * Basecamp). One row per actor: the access token, the refresh token used to
 * renew it when it expires, when it expires, and the provider account the
 * token is scoped to (Basecamp's API is account-scoped:
 * https://3.basecampapi.com/{accountId}/...).
 *
 * Tokens are domain state, not config — they belong in the DB against the
 * actor that authorized, not in .env or the Keychain (which hold the app-level
 * client id/secret). Keyed per-actor so growing from single- to multi-tenant
 * is additive (more rows), not a re-home.
 *
 * Progressive migrations: createTable silently ignores inline references /
 * indexes, so the foreign key and the unique index are separate migrations
 * that follow this one.
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('IntegrationUserOAuthData', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      integrationUserId: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      // Tokens are long opaque strings — TEXT, not STRING(255), to avoid
      // truncation.
      accessToken: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      refreshToken: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      expiresAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      // Provider account id is an opaque external id — keep it a string, never
      // parseInt (see CLAUDE.md "External ids are opaque strings").
      accountId: {
        type: Sequelize.STRING,
        allowNull: false,
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
  },

  async down(queryInterface) {
    await queryInterface.dropTable('IntegrationUserOAuthData');
  },
};
