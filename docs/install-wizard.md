# Install wizard

The wizard is Tabularium's cold-start flow: the backend boots **without** a database connection, prints a bootstrap admin password, and gates every non-init route behind a setup screen.

## Flow

1. **Cold boot** — `data/config.json` is absent or has `installed: false`. The backend prints the banner and serves only the wizard endpoints.
2. **Bootstrap login** — `admin@example.com` + the printed password. The credentials live in process memory only.
3. **Database configuration** — pick a dialect (PostgreSQL / MySQL / SQLite) and fill in the structured fields (host / port / user / password / database, or a file path for SQLite). The wizard renders a live connection-URL preview. An "Advanced" toggle still accepts a raw URL.
4. **Test connection** — the "Test connection" button calls `POST /api/init/test-db`, which opens a one-shot driver client, runs `SELECT 1`, and reports ✓ or ✗ with a server-side error message. No state is committed.
5. **Submit** — runs the migrations for the chosen dialect, seeds default CMS pages, promotes the bootstrap account to a real admin row, writes `data/config.json`, **issues an admin JWT and sets the auth cookie**, then `process.exit(0)`s.
6. **Auto-restart + auto-redirect** — the wizard polls `/api/init/status` every 500 ms (up to 30 s). The endpoint now returns `mode: 'setup' | 'normal'`; the wizard waits for `mode === 'normal'`, meaning the new process has fully booted (DB connected, cache + storage initialized). On first match, it navigates to `/admin`. The auth cookie set in step 5 survives the restart (`JWT_SECRET` is env-loaded), so the admin lands inside `/admin` already signed in.
7. **Fallback** — if the restart hangs longer than 30 s, the wizard falls back to a manual "sign in at `/login/admin`" CTA.

The dev workflow uses `apps/api/scripts/dev.sh` which respawns the backend on clean exit.

## State

```
apps/api/data/config.json
{
  "installed": true,
  "database": { "url": "postgres://…" }
}
```

This file is the install lock. Delete it to re-trigger the wizard. The DB is *not* wiped — empty the database manually if you want a clean run.

## Override

Skip the wizard entirely by pre-creating `data/config.json` and seeding the DB yourself. Useful for IaC deploys.
