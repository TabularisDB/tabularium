# Install wizard

The wizard is Tabularium's cold-start flow: the backend boots **without** a database connection, prints a bootstrap admin password, and gates every non-init route behind a setup screen.

## Flow

1. **Cold boot** — `data/config.json` is absent or has `installed: false`. The backend prints the banner and serves only the wizard endpoints.
2. **Bootstrap login** — `admin@example.com` + the printed password. The credentials live in process memory only.
3. **Database URL** — submitted on `/welcome`. The wizard tests the connection, runs migrations, seeds pages.
4. **Promotion** — the bootstrap account is written into the `users` + `root_credentials` tables as a real admin row.
5. **Restart** — `installed: true` is persisted; the backend `process.exit(0)`s so your supervisor (dev script, systemd, docker restart-policy) brings it back up in "installed" mode.

The dev workflow uses `apps/backend/scripts/dev.sh` which respawns the backend on clean exit.

## State

```
apps/backend/data/config.json
{
  "installed": true,
  "database": { "url": "postgres://…" }
}
```

This file is the install lock. Delete it to re-trigger the wizard. The DB is *not* wiped — empty the database manually if you want a clean run.

## Override

Skip the wizard entirely by pre-creating `data/config.json` and seeding the DB yourself. Useful for IaC deploys.
