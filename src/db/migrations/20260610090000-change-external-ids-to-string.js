'use strict';

/**
 * External IDs were INTEGER because the stub client generated numeric ids.
 * Real providers don't fit that: ClickUp task ids are alphanumeric strings
 * (e.g. "868c9j2kq") and its list ids overflow 32-bit. Store all external
 * ids as strings; they are opaque handles, never arithmetic.
 */

const columns = [
  ['Boards', 'integrationBoardId'],
  ['Tasks', 'integrationTaskId'],
  ['Comments', 'integrationCommentId'],
  ['IntegrationUsers', 'externalUserId'],
];

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    for (const [table, column] of columns) {
      await queryInterface.changeColumn(table, column, {
        type: Sequelize.STRING,
        allowNull: true,
      });
    }
  },

  async down(queryInterface, Sequelize) {
    // Postgres can't cast varchar -> integer automatically; changeColumn
    // generates ALTER TYPE without USING, so cast explicitly here.
    for (const [table, column] of columns) {
      await queryInterface.sequelize.query(
        `ALTER TABLE "${table}" ALTER COLUMN "${column}" TYPE INTEGER USING "${column}"::integer`
      );
    }
  },
};
