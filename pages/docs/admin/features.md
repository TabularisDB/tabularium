# Features

Feature flags let an operator temporarily disable parts of the registry without a redeploy.

## Flags

| Flag | Off behaviour |
|------|---------------|
| `features.submissions_enabled` | `/submit` shows a "submissions disabled" notice. `POST /api/submit/oauth` returns 403. Existing plugins keep working. |
| `features.requests_enabled` | `/requests` hides the create form. `POST /api/requests` returns 403. Upvotes on existing requests still work. |

## Use cases

- **Migration windows** — disable submissions while moving the registry to a new host.
- **Spam events** — pause new requests while you clean up backlog.
- **Soft launch** — keep submissions off until the registry has enough featured plugins.

Toggle them in `/admin/features`. The change is live in the next API call — no restart.
