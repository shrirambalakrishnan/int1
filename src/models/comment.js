'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Comment extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      Comment.belongsTo(models.Task, {
        foreignKey: 'taskId',
        as: 'task',
      });
    }
  }
  Comment.init(
    {
      taskId: {
        type: DataTypes.NUMBER,
        allowNull: false,
      },
      content: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      createdByIntegrationUserId: {
        type: DataTypes.NUMBER,
        allowNull: true,
      },
      integrationCommentId: {
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
      modelName: 'Comment',
      indexes: [
        {
          unique: true,
          fields: ['taskId', 'integrationCommentId'],
          name: 'comments_task_id_integration_comment_id_unique',
        },
      ],
    }
  );
  return Comment;
};
