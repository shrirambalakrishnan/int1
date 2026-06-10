'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Task extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      Task.belongsTo(models.Board, {
        foreignKey: 'boardId',
        as: 'board',
      });
      Task.hasMany(models.Comment, {
        foreignKey: 'taskId',
        as: 'comments',
        onDelete: 'CASCADE',
        hooks: true,
      });
    }
  }
  Task.init(
    {
      title: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      description: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      boardId: {
        type: DataTypes.NUMBER,
        allowNull: false,
      },
      integrationTaskId: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      createdByIntegrationUserId: {
        type: DataTypes.NUMBER,
        allowNull: true,
      },
      integrationUserIdAssigned: {
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
      modelName: 'Task',
      indexes: [
        {
          unique: true,
          fields: ['boardId', 'integrationTaskId'],
          name: 'tasks_board_id_integration_task_id_unique',
        },
      ],
    }
  );
  return Task;
};
