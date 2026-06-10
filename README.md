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

## Secrets

Secrets (API tokens, passwords, keys) are **never stored in `.env` or any file in the
repo** — even though `.env` is gitignored, plaintext secrets on disk leak through
backups, editor history, and accidental un-ignoring. `.env` holds only non-secret
config (DB host, ClickUp space id, etc.).

Secrets live in the **macOS Keychain**, managed with the built-in `security` CLI.

### Conventions

- One Keychain item per secret, stored as a *generic password*.
- The **service name (`-s`) is exactly the env var name** the code expects
  (e.g. `CLICKUP_API_TOKEN`), so the mapping is self-documenting.
- The account (`-a`) is always `$USER`.

### Commands

```bash
# Store a secret (run once). -w with no value prompts interactively,
# keeping the secret out of shell history. -U overwrites an existing item.
security add-generic-password -U -a "$USER" -s "CLICKUP_API_TOKEN" -w

# Read it back
security find-generic-password -a "$USER" -s "CLICKUP_API_TOKEN" -w

# Delete it
security delete-generic-password -a "$USER" -s "CLICKUP_API_TOKEN"
```

### Using a secret

Inline in one-off commands:

```bash
curl -s -H "Authorization: $(security find-generic-password -a "$USER" -s CLICKUP_API_TOKEN -w)" \
  https://api.clickup.com/api/v2/user
```

Or export into the shell before starting the app, alongside sourcing `.env`:

```bash
set -a; . ./.env; set +a
export CLICKUP_API_TOKEN=$(security find-generic-password -a "$USER" -s CLICKUP_API_TOKEN -w)
npm start
```

The app reads secrets from `process.env` as usual — it neither knows nor cares that
the value came from the Keychain.

### Current secrets

| Keychain service / env var | Purpose                          |
|----------------------------|----------------------------------|
| `CLICKUP_API_TOKEN`        | ClickUp personal API token (`pk_…`) for the ClickUp integration |
