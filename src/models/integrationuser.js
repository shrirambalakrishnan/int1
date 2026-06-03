'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class IntegrationUser extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
    }
  }
  IntegrationUser.init(
    {
      integrationId: {
        type: DataTypes.NUMBER,
        allowNull: false,
      },
      externalUserId: {
        type: DataTypes.NUMBER,
        allowNull: false,
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
        type: DataTypes.NUMBER,
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
      ],
    }
  );
  return IntegrationUser;
};
