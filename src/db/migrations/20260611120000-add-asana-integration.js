'use strict';

/**
 * Reference-data migration: the 'asana' Integration row. selectIntegration
 * keys the client registry off this name — without the row, asana boards
 * silently fall back to the stub client, so its existence is a deploy-time
 * requirement, not sample data. A migration (tracked, runs exactly once per
 * environment) guarantees that; seeders are untracked and easy to skip.
 *
 * ON CONFLICT makes it safe on databases where the row was already created
 * ad hoc (dev), relying on the unique constraint on Integrations.name.
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `INSERT INTO "Integrations" ("name", "createdAt", "updatedAt")
       VALUES ('asana', NOW(), NOW())
       ON CONFLICT ("name") DO NOTHING`
    );
  },

  async down() {
    // Intentionally a no-op. Deleting the row would cascade to Boards (FK is
    // ON DELETE CASCADE), and on dev databases the row may predate this
    // migration — removing data the migration didn't create isn't a revert.
  },
};
