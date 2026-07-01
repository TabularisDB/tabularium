---
title: "API tokens (M2M)"
---

# API tokens (M2M)

Long-lived bearer tokens for machine-to-machine access to `/api/admin/*`. Same surface as the session-JWT admin auth — every admin route accepts either mode.

## Token format

```
tbm_<22 url-safe base64 chars>
```

`tbm_` is the registry's magic prefix so the auth middleware can short-circuit JWT verification when it sees an obvious API-token request. The payload is 24 random bytes from a CSPRNG (`crypto.getRandomValues`), encoded as url-safe base64 without padding — 192 bits of entropy.

## What's persisted

| Column        | Value                                                                                       |
|---------------|---------------------------------------------------------------------------------------------|
| `tokenHash`   | sha256 hex of the plaintext token. Indexed for O(1) lookup on each request.                 |
| `prefix`      | First 12 chars (`tbm_xxxxxxxx`). Shown in listings so admins can identify a specific token. |
| `name`        | Free-form label set at creation (max 80 chars).                                             |
| `scopes`      | Optional JSON array of scope strings. `null` = full admin. (Enforcement is a follow-up.)    |
| `expiresAt`   | Optional unix-ms timestamp. Past = treated as revoked.                                      |
| `lastUsedAt`  | Fire-and-forget update on each successful verification.                                     |
| `revokedAt`   | Set by `DELETE /api/admin/tokens/:id`. Revoked tokens are rejected immediately.             |

The **plaintext token is never persisted**. It's returned exactly once in the `POST /api/admin/tokens` response and shown once in the admin UI inside an amber warning card. Lose it and you create a new one — there is no recovery path.

## Create one

### Via the admin UI

`Admin → API tokens → Create token`. Pick a name (e.g. `CI seeder`, `GitHub Actions`). The amber box shows the token once with a Copy button.

### Via the JSON-Tokens admin API

```bash
curl -X POST https://registry.example.com/api/admin/tokens \
  -H "Authorization: Bearer $SESSION_JWT" \
  -H "Content-Type: application/json" \
  -d '{ "name": "CI seeder" }'
```

Response:

```json
{
  "token": "tbm_3KVNsn-zEVWQ3IzOXQxfe3e3AvQOx7Wz",
  "row": {
    "id": "01J…",
    "name": "CI seeder",
    "prefix": "tbm_3KVNsn-z",
    "scopes": null,
    "expiresAt": null,
    "lastUsedAt": null,
    "createdAt": 1780058...,
    "revokedAt": null
  }
}
```

Optional body fields:

- `expiresAt: number | null` — unix-ms in the future. Past or omitted = no expiry.
- `scopes: string[] | null` — array of `^[a-z][a-z0-9.:_-]*$` strings (max 16, each ≤ 40 chars). Scopes are stored but **not yet enforced** at the route layer; the field is there for forward compatibility.

## Use one

Send as a standard bearer:

```bash
curl -H "Authorization: Bearer $TOKEN" \
  https://registry.example.com/api/admin/kinds
```

Works for every `/api/admin/*` endpoint. The audit log records the admin user the token was minted under; you can disambiguate token vs. browser session in audit meta via the `kind: admin_token` marker the middleware sets.

## Revoke one

```bash
curl -X DELETE "https://registry.example.com/api/admin/tokens/$ID" \
  -H "Authorization: Bearer $SESSION_JWT"
```

Or `Revoke` in the UI. Revoke is **owner-only** — you can't revoke another admin's token.

## Audit log

Two new actions land in `/admin/audit`:

| Action                | Target                  | Meta                                                                |
|-----------------------|-------------------------|---------------------------------------------------------------------|
| `admin_token.create`  | `admin_token:<id>`      | `{ name, scopes, expiresAt }`                                       |
| `admin_token.revoke`  | `admin_token:<id>`      | —                                                                   |

## Why not OAuth / Better Auth / Unkey?

We picked the simplest pattern that's also the industry-standard one: random + sha256-hash. GitHub PATs, Stripe API keys, OpenAI keys — same shape. The "big libs" mostly add per-key rate-limiting, usage analytics, and IP allowlists; those are tracked as follow-ups but aren't fundamental to the auth model.
