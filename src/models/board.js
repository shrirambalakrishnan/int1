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
      // define association here
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
        allowNull: false,
      },
      integrationId: {
        type: DataTypes.NUMBER,
        allowNull: false,
      },
      createdByIntegrationUserId: {
        type: DataTypes.NUMBER,
        allowNull: false,
      },
      integrationUpdatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
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
