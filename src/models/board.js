'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Board extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      Board.belongsTo(models.Integration, {
        foreignKey: 'integrationId',
        as: 'integration',
      });
      Board.hasMany(models.Task, {
        foreignKey: 'boardId',
        as: 'tasks',
      });
    }
  }
  Board.init(
    {
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      integrationBoardId: {
        type: DataTypes.NUMBER,
        allowNull: true,
      },
      integrationId: {
        type: DataTypes.NUMBER,
        allowNull: false,
      },
      createdByIntegrationUserId: {
        type: DataTypes.NUMBER,
        allowNull: true,
      },
      integrationUpdatedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: 'Board',
      indexes: [
        {
          unique: true,
          fields: ['integrationId', 'integrationBoardId'],
          name: 'boards_integration_id_integration_board_id_unique',
        },
      ],
    }
  );
  return Board;
};
