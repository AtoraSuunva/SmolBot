# API Documentation

An API is exposed at <https://smol.giraffeduck.com/api/> that allows you to build your own integrations with the bot. The API accepts and responds with JSON.

## Authentication

All API endpoints that require authentication use bearer auth with an API token.

```http
Authorization: Bearer <token>
```

- Tokens can be created via the bot on Discord:
  - Use the bot command `/api token create` to generate a new token.
  - By default, this command is only available to member with administrator permissions.
  - The token string is shown only once at creation and will not be shown again, so save it somewhere secure.
- Or by the API endpoint `/api/token/create` using a token with `CreateToken` permission:
  - When creating tokens via the API, the new token's permissions must be a subset of the parent token's permissions.
  - Tokens created via this endpoint are considered "child tokens" and will be deleted if the parent token is deleted
- Tokens are internally generated as 32 random bytes (base64) and stored in the database as a SHA256 hash. The API verifies tokens by hashing the provided token and looking up the hash.
- Requests that require permissions will return 403 if the token lacks the required permission bits. Missing or malformed Authorization headers return 401.

The bot provides the following Discord subcommands under `/api token` to manage tokens:

- `create` — Create a new token.
- `list` — List tokens for the current guild (with optional filtering for a specific user). Returns token metadata (ID, parent ID, user, name, permissions, expiresAt).
- `check` — Verify a token string and show its decoded payload.
- `delete` — Delete a token by `token_id` (only for tokens in that guild) or by the token string itself (for any token). Deletes the token (and its child tokens).

## Common behavior

- CORS: `Access-Control-Allow-*` is applied to routes under `/api/*`.
- Logging: requests are logged via the app logger.
- Permission model: permissions are stored as a numeric bitfield. Some routes require particular permission bits to be present on the token.

## Permissions

Token permissions are stored as a numerical bitfield.

| Name          | Bit value | Description                                              |
| ------------- | --------: | -------------------------------------------------------- |
| CreateToken   |  `1 << 0` | Create a new token (`POST /api/token/create`)            |
| ReadActionLog |  `1 << 1` | Read action log (`GET /api/action-log/:guildId/:userId`) |

---

## `GET /api/action-log/:guildId`

|                    |                 |
| ------------------ | --------------- |
| **Authentication** | Required        |
| **Permissions**    | `ReadActionLog` |

Returns action log entries for a given guild.

### Path parameters (guild action logs)

| name      | type   | description                                                                                |
| --------- | ------ | ------------------------------------------------------------------------------------------ |
| `guildId` | string | Snowflake ID of the guild. This is checked against the guild ID associated with the token. |

### Query parameters (guild action logs)

| name          | type          | description                                                                                                                                             |
| ------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `action`      | string (enum) | Optional. Filter by action. Allowed values: `ban`, `unban`, `kick`, `timeout`, `timeout removed`, `softban`, `reban`                                    |
| `allVersions` | boolean       | Optional. If `true` return all versions of action log entries; if omitted or `false`, only return entries where `validUntil` is null (current version). |
| `limit`       | number        | Optional. The amount of results to return, minimum 1, maximum 100, default 100.                                                                         |
| `before`      | number        | Optional. Return results with an `actionID` smaller than this.                                                                                          |
| `after`       | number        | Optional. Return results with an `actionID` greater than this.                                                                                          |

### Example request (guild action logs)

```http
GET /api/action-log/12345678901234567?action=ban&allVersions=true
Authorization: Bearer <token>
```

### Example response (guild action logs)

```json
[
  {
    "guildID": "12345678901234567",
    "actionID": 987,
    "version": 1,
    "action": "ban",
    "userID": "23456789012345678",
    "redactUser": false,
    "reason": "Example reason",
    "reasonByID": null,
    "moderatorID": "34567890123456789",
    "channelID": "45678901234567890",
    "messageID": null,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "validUntil": null
  }
]
```

## `GET /api/action-log/:guildId/:userId`

|                    |                 |
| ------------------ | --------------- |
| **Authentication** | Required        |
| **Permissions**    | `ReadActionLog` |

Returns action log entries for a given user in a guild.

### Path parameters (user action logs)

| name      | type   | description                                                                                |
| --------- | ------ | ------------------------------------------------------------------------------------------ |
| `guildId` | string | Snowflake ID of the guild. This is checked against the guild ID associated with the token. |
| `userId`  | string | Snowflake ID of the user                                                                   |

### Query parameters (user action logs)

| name          | type          | description                                                                                                                                             |
| ------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `action`      | string (enum) | Optional. Filter by action. Allowed values: `ban`, `unban`, `kick`, `timeout`, `timeout removed`, `softban`, `reban`                                    |
| `allVersions` | boolean       | Optional. If `true` return all versions of action log entries; if omitted or `false`, only return entries where `validUntil` is null (current version). |
| `limit`       | number        | Optional. The amount of results to return, minimum 1, maximum 100, default 100.                                                                         |
| `before`      | number        | Optional. Return results with an `actionID` smaller than this.                                                                                          |
| `after`       | number        | Optional. Return results with an `actionID` greater than this.                                                                                          |

### Example request (user action logs)

```http
GET /api/action-log/12345678901234567/23456789012345678?action=ban&allVersions=true
Authorization: Bearer <token>
```

### Example response (user action logs)

```json
[
  {
    "guildID": "12345678901234567",
    "actionID": 987,
    "version": 1,
    "action": "ban",
    "userID": "23456789012345678",
    "redactUser": false,
    "reason": "Example reason",
    "reasonByID": null,
    "moderatorID": "34567890123456789",
    "channelID": "45678901234567890",
    "messageID": null,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "validUntil": null
  }
]
```

---

## `GET /api/token/info`

|                    |          |
| ------------------ | -------- |
| **Authentication** | Required |
| **Permissions**    | -        |

Returns metadata about the token used for the request. Requires an Authorization header.

### Example request (token info)

```http
GET /api/token/info
Authorization: Bearer <token>
```

### Example response (token info)

```json
{
  "name": "My token",
  "tokenID": 42,
  "parentTokenID": null,
  "userID": "23456789012345678",
  "guildID": "12345678901234567",
  "permissions": 2,
  "createdAt": "2024-01-01T00:00:00.000Z",
  "expiresAt": null
}
```

---

## `POST /api/token/create`

|                    |               |
| ------------------ | ------------- |
| **Authentication** | Required      |
| **Permissions**    | `CreateToken` |

Create a new API token. The new token's permissions must be a subset of the requesting token's permissions.

The token will only be shown once in the creation response. It will not be shown again.

### Body payload (token create)

`Content-Type: application/json`

| name          | type                                                    | description                                                                              |
| ------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `name`        | string                                                  | Name for the new token (max length 25)                                                   |
| `permissions` | number                                                  | Optional. Numeric permission bitfield for the new token. Defaults to 0 (no permissions). |
| `expiresAt`   | string (ISO 8601) or number (unix milliseconds) or null | Optional. Expiration date/time for the new token. Omit or use `null` for no expiry.      |

### Example request (token create)

```http
POST /api/token/create
Authorization: Bearer <parent-token>
Content-Type: application/json

{
  "name": "Read-only token",
  "permissions": 0,
  "expiresAt": null
}
```

### Example response (token create)

```json
{
  "token": "<plaintext-token-string>",
  "tokenInfo": {
    "name": "Read-only token",
    "tokenID": 123,
    "parentTokenID": 42,
    "userID": "23456789012345678",
    "guildID": "12345678901234567",
    "permissions": 0,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "expiresAt": null
  }
}
```

---

## `DELETE /api/token/delete`

|                    |          |
| ------------------ | -------- |
| **Authentication** | Required |
| **Permissions**    | -        |

Delete the token used for the request. Child tokens (if any) are also deleted. This route returns the amount of deleted tokens.

### Example request (token delete)

```http
DELETE /api/token/delete
Authorization: Bearer <token>
```

### Example response (token delete)

```json
{
  "count": 1
}
```
