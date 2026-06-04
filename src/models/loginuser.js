'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class LoginUser extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      LoginUser.hasMany(models.IntegrationUser, {
        foreignKey: 'loginUserId',
        as: 'integrationUsers',
        onDelete: 'CASCADE',
        hooks: true,
      });
    }
  }
  LoginUser.init(
    {
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      email: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
    },
    {
      sequelize,
      modelName: 'LoginUser',
    }
  );
  return LoginUser;
};
