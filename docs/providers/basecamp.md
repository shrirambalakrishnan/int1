# Basecamp (OAuth2)

[← back to README](../../README.md) · [Integrations overview](../../README.md#integrations) · [Authentication](../../README.md#authentication)

Basecamp 4 (the BC3 API) is the first provider authenticated with **OAuth2** instead of
a static token — chosen precisely because it is **OAuth2-only** (Basic auth was removed),
so it forces the OAuth path the `token` strategy never exercised. The `/oauth/basecamp/*`
routes and token storage landed under issue #27; the `oauth2` strategy and the outbound
client (Board/Task/Comment push) landed under issue #38. Outbound push only (no inbound
webhook yet).

**Resource mapping** (parallels ClickUp's Space → List → Task → Comment): a pinned
**Project** (`BASECAMP_PROJECT_ID`) is the workspace int1 syncs into, and within its
**to-do set** (one per project, resolved from the project's dock — or pinned via
`BASECAMP_TODOSET_ID` to skip the lookup):

| int1    | Basecamp 4   | Endpoint (account-scoped base `https://3.basecampapi.com/{accountId}`) |
|---------|--------------|------------------------------------------------------------------------|
| Board   | to-do list   | `POST /todosets/{todosetId}/todolists.json`, `PUT /todolists/{id}.json` |
| Task    | to-do        | `POST /todolists/{boardId}/todos.json`, `PUT /todos/{id}.json`          |
| Comment | comment      | `POST /recordings/{taskId}/comments.json`, `PUT /comments/{id}.json`    |

Two Basecamp quirks the client absorbs: every request needs a **`User-Agent`** header
(missing → 400; carried via `request.js`'s `defaultHeaders` hook), and Basecamp's **PUT
clears any field it isn't sent** — so `updateTask` always resends both `content` and
`description`, unlike ClickUp/Asana's partial PUT. The base URL is account-scoped and the
token is per-connection, so the Basecamp client is **built per call** by
`resolveBasecampClient` (which loads the stored token and wires the `oauth2` strategy),
not registered as a shared singleton like the other clients.

- **Auth**: OAuth2 **authorization-code** flow — the only grant Basecamp offers (there is
  no client-credentials / app-only option, so a human consents at least once). Register an
  app at [launchpad.37signals.com/integrations](https://launchpad.37signals.com/integrations)
  to get a **Client ID** and **Client Secret**, with the redirect URI pointing at the
  callback route. Basecamp predates the final spec (OAuth2 **draft 5**): the authorize and
  token URLs take a non-standard `type=web_server` param, there is **no PKCE** and **no
  discovery document**, and access tokens **expire after 2 weeks** with a refresh token to
  renew them. PKCE isn't needed here — int1 is a confidential server-side client, so the
  client secret (kept server-side) is the protection PKCE would otherwise provide.
- **Config homes**:
  - `BASECAMP_CLIENT_ID` — non-secret → `.env`
  - `BASECAMP_REDIRECT_URI` — non-secret → `.env`
    (e.g. `http://localhost:3000/oauth/basecamp/callback`; the OAuth redirect is
    **browser-driven**, so localhost works without a tunnel — unlike the webhooks)
  - `BASECAMP_PROJECT_ID` — non-secret → `.env` (the project int1 syncs into; like
    `CLICKUP_SPACE_ID`). Optional `BASECAMP_TODOSET_ID` skips the one-time dock lookup.
  - `BASECAMP_CLIENT_SECRET` — secret → **Keychain** (see [Secrets](../../README.md#secrets))
- **Tokens are not config.** The per-connection access token, refresh token, expiry, and
  Basecamp account id are **domain state**, stored in the database against the connecting
  `IntegrationUser` — single-tenant first (one connected actor), keyed per-actor so growing
  to multi-tenant is additive (more rows) rather than a re-home.

Connect once via the browser, then drive a sync by hand — the `oauth2` strategy reads the
stored token, so only the non-secret `.env` config and `BASECAMP_CLIENT_SECRET` (for token
refresh) need to be set:

```bash
# 1. open http://localhost:3000/oauth/basecamp/connect in a browser and consent
# 2. then:
export BASECAMP_CLIENT_SECRET=$(security find-generic-password -a "$USER" -s BASECAMP_CLIENT_SECRET -w)
npm run emit:board:created -- <boardId> <integrationId>
```
