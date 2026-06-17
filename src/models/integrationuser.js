'use strict';
const { Model, Op } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class IntegrationUser extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      IntegrationUser.belongsTo(models.Integration, {
        foreignKey: 'integrationId',
        as: 'integration',
      });
      IntegrationUser.belongsTo(models.LoginUser, {
        foreignKey: 'loginUserId',
        as: 'loginUser',
      });
      // 1:1 OAuth token set (issue #27). Cascade in the JS layer as well as the
      // DB FK so instance.destroy() cleans up the tokens via hooks.
      IntegrationUser.hasOne(models.IntegrationUserOAuthData, {
        foreignKey: 'integrationUserId',
        as: 'oauthData',
        onDelete: 'CASCADE',
        hooks: true,
      });
    }
  }
  IntegrationUser.init(
    {
      integrationId: {
        type: DataTypes.NUMBER,
        allowNull: true,
      },
      externalUserId: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      loginUserId: {
        type: DataTypes.NUMBER,
        allowNull: true,
      },
      integrationUserName: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      integrationUserEmail: {
        type: DataTypes.STRING,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: 'IntegrationUser',
      indexes: [
        {
          unique: true,
          fields: ['integrationId', 'externalUserId'],
          name: 'integration_users_integration_id_external_user_id_unique',
        },
        {
          unique: true,
          fields: ['loginUserId'],
          name: 'integration_users_login_user_id_unique',
          where: { loginUserId: { [Op.ne]: null } },
        },
      ],
    }
  );
  return IntegrationUser;
};
