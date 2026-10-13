---
title: "Features"
---

# Features

Feature flags let an operator temporarily disable parts of the registry without a redeploy.

## Flags

| Flag | Off behaviour |
|------|---------------|
| `features.submissions_enabled` | `/submit` shows a "submissions disabled" notice. `POST /api/submit/oauth` returns 403. Existing plugins keep working. |
| `features.requests_enabled` | `/requests` hides the create form. `POST /api/requests` returns 403. Upvotes and claims on approved requests still work. |

## Use cases

- **Migration windows** — disable submissions while moving the registry to a new host.
- **Spam events** — pause new requests while you clean up backlog.
- **Soft launch** — keep submissions off until the registry has enough featured plugins.

Toggle them in `/admin/features`. The change is live in the next API call — no restart.

## Request lifecycle

Plugin requests are reviewed before they become public bounties:

| Status | Who sees it | How it gets there |
|--------|-------------|-------------------|
| `pending` | Admins and the requester | Every new request starts here. |
| `approved` | Everyone | An admin approves it in `/admin/requests` and fills in the bounty details (tagline, scope, difficulty, next step, board label). Users can upvote and claim it; with at least one claim it shows as in progress. |
| `rejected` | Admins and the requester | An admin rejects it, optionally with a reason. |
| `fulfilled` | Everyone | A plugin whose slug matches the request is approved and has a manifest ingested from a release. The request stays, linked to the plugin. |

Claimers of a `driver` or `theme` request can create a repository scaffolded by `@tabularis/create-plugin` from `/requests` (`POST /api/requests/:id/scaffold`). GitHub asks for the extra `workflow` scope the first time, because the scaffold includes CI workflows.

Each transition emits a webhook event: `request.created`, `request.approved`, `request.rejected`, `request.claimed`, `request.unclaimed`, `request.scaffolded`, `request.repo_linked` and `request.fulfilled`. The **Static site rebuild** preset posts them to a deploy hook, for sites that bake request data in at build time.

To seed requests from a curated list in the tabularis.dev `pluginBounties.json` format, run `bun run import:bounties [file-or-url]` in `apps/api` (inside the running container: `bun scripts/import-bounties.ts`). It uses the same database as the server — `database.url` from the instance `config.json`, falling back to `DATABASE_URL`. Use `--dry-run` to preview.
