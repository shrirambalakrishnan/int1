'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Integration extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      Integration.hasMany(models.Board, {
        foreignKey: 'integrationId',
        as: 'boards',
        onDelete: 'CASCADE',
        hooks: true,
      });
      Integration.hasMany(models.IntegrationUser, {
        foreignKey: 'integrationId',
        as: 'integrationUsers',
        onDelete: 'CASCADE',
        hooks: true,
      });
    }
  }
  Integration.init({
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    }
  }, {
    sequelize,
    modelName: 'Integration',
  });
  return Integration;
};