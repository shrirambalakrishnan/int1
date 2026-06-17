'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  /**
   * The OAuth2 token set held for one IntegrationUser (issue #27, Basecamp).
   * 1:1 with IntegrationUser — see the unique index on integrationUserId.
   * Tokens are domain state stored in the DB (the app-level client id/secret
   * live in .env / Keychain instead).
   */
  class IntegrationUserOAuthData extends Model {
    static associate(models) {
      IntegrationUserOAuthData.belongsTo(models.IntegrationUser, {
        foreignKey: 'integrationUserId',
        as: 'integrationUser',
      });
    }
  }
  IntegrationUserOAuthData.init(
    {
      integrationUserId: {
        type: DataTypes.NUMBER,
        allowNull: false,
      },
      accessToken: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      refreshToken: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      expiresAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      // Opaque external id — kept a string, never parseInt.
      accountId: {
        type: DataTypes.STRING,
        allowNull: false,
      },
    },
    {
      sequelize,
      modelName: 'IntegrationUserOAuthData',
      // Set explicitly so the model and the migration agree on the table name
      // (the other tables rely on pluralization, but "...Data" is ambiguous).
      tableName: 'IntegrationUserOAuthData',
      indexes: [
        {
          unique: true,
          fields: ['integrationUserId'],
          name: 'integration_user_oauth_data_integration_user_id_unique',
        },
      ],
    }
  );
  return IntegrationUserOAuthData;
};
