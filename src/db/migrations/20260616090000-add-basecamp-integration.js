'use strict';

/**
 * Reference-data migration: the 'basecamp' Integration row. Like the clickup,
 * asana and trello rows, selectIntegration keys its client registry off this
 * name — without the row, basecamp boards silently fall back to the stub
 * client, so the row is a deploy-time requirement, not sample data.
 *
 * (The basecamp client itself is OAuth2 and still being built under issue #27;
 * the row lands first so the integration, its IntegrationUser, and the stored
 * OAuth tokens all have something to reference.)
 *
 * ON CONFLICT makes it safe on databases where the row was already created ad
 * hoc (dev), relying on the unique constraint on Integrations.name.
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `INSERT INTO "Integrations" ("name", "createdAt", "updatedAt")
       VALUES ('basecamp', NOW(), NOW())
       ON CONFLICT ("name") DO NOTHING`
    );
  },

  async down() {
    // Intentionally a no-op. Deleting the row would cascade to Boards and
    // IntegrationUsers (FKs are ON DELETE CASCADE), and on dev databases the
    // row may predate this migration — removing data the migration didn't
    // create isn't a revert.
  },
};
