# int1

## What is int1?

A unified aggregator for Project Management Tools

## Problem Statement
- Different teams within a company can use different Project Management tools based on their requirements
  - This affect visibility of overall tasks for the management
  - We need a way to look at all the projects across all the team at a single place
- The above use case invariably leads to the need for taking action from aggregator whenever user needs
  - We need a way to sync data aggregator to the project management tool

## Entities

- These are int1's entities. 
- Each integration maps its own terminology onto this schema as part of its integration plan.

| Entity   | Description                                                        |
|----------|--------------------------------------------------------------------|
| User     | A member of a board. Used for login and as a task assignee.        |
| Board    | A collection of tasks, typically owned by one team.                |
| Task     | A unit of work on a board, assignable to a User.                   |
| Comment  | An update added to a Task by a User.                               |

### Planned for future

| Entity     | Description                              |
|------------|------------------------------------------|
| Subtask    | A child task nested under a parent task  |
| Attachment | One or more documents added to a comment |
