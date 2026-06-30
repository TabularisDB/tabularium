# Tabularium dev recipes — run `just` (no args) to list available targets.

minikube_profile := "tabularium"

# Show available recipes.
default:
    @just --list

# Start the local minikube cluster (if needed) and bring up Tilt.
# Tilt UI opens at http://localhost:10350.
dev:
    #!/usr/bin/env bash
    set -euo pipefail
    echo "Starting minikube with profile {{minikube_profile}}..."
    if minikube status -p {{minikube_profile}} 2>/dev/null | grep -q "Running"; then
      echo "minikube is already running!"
    else
      minikube start -p {{minikube_profile}}
    fi
    echo "Starting tilt..."
    default_port=10350
    # If the default Tilt UI is responsive, leave it alone.
    if curl -sf --max-time 2 -o /dev/null "http://localhost:${default_port}/api/view"; then
      echo "tilt is already running — open http://localhost:${default_port}"
      exit 0
    fi
    # Default port held by something else (stale tilt, another tool, etc.)?
    # Pick a free port in 10351..11349 instead of bailing.
    port=$default_port
    if (exec 3<>/dev/tcp/127.0.0.1/$port) 2>/dev/null; then
      exec 3<&- 3>&-
      for _ in $(seq 1 50); do
        candidate=$((10351 + RANDOM % 999))
        if ! (exec 3<>/dev/tcp/127.0.0.1/$candidate) 2>/dev/null; then
          port=$candidate
          break
        fi
        exec 3<&- 3>&-
      done
      if [ "$port" = "$default_port" ]; then
        echo "could not find a free port near ${default_port} after 50 tries — giving up" >&2
        exit 1
      fi
      echo "port ${default_port} busy — starting tilt on ${port} → open http://localhost:${port}"
    fi
    tilt up --port="$port"

# Stop tilt-managed workloads. PVCs (postgres data, dragonfly data) survive.
down:
    tilt down

# Stop tilt + delete the minikube profile entirely (full reset).
nuke:
    -tilt down
    minikube delete -p {{minikube_profile}}

# Wipe the dev DB so the next boot starts at /init with a fresh admin record.
# Postgres PVC, dragonfly cache, and minikube itself stay intact — much faster
# than `just nuke`. Use this when bootstrap creds drift or the schema is wedged.
reset:
    #!/usr/bin/env bash
    set -euo pipefail
    ns=tabularium-dev
    echo "→ Scaling tabularium-api to 0 so we can drop schemas without lock waits..."
    kubectl -n $ns scale deploy/tabularium-api --replicas=0
    kubectl -n $ns wait --for=delete pod -l app=tabularium-api --timeout=30s 2>/dev/null || true
    echo "→ Dropping public + drizzle schemas..."
    kubectl -n $ns exec deploy/postgres -- psql -U tabularium -d tabularium -v ON_ERROR_STOP=1 -c \
      "DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO tabularium;"
    echo "→ Flushing dragonfly cache..."
    kubectl -n $ns exec deploy/dragonfly -- redis-cli FLUSHALL >/dev/null || true
    # Bring api back up briefly so we can exec into it and reset the install marker.
    # config.json lives on a PVC and survives DB schema drops — without flipping
    # `installed:false` the next boot would see "installed" + empty DB and lock
    # the user out (no /init wizard, no providers, /login/admin → 404).
    echo "→ Resetting install marker in /data/config.json so /init runs again..."
    kubectl -n $ns scale deploy/tabularium-api --replicas=1
    kubectl -n $ns rollout status deploy/tabularium-api --timeout=120s
    kubectl -n $ns exec deploy/tabularium-api -- bun -e \
      'const f="/data/config.json"; const c=await Bun.file(f).json(); c.installed=false; await Bun.write(f, JSON.stringify(c, null, 2)+"\n");'
    echo "→ Restarting api to pick up the flipped marker..."
    kubectl -n $ns rollout restart deploy/tabularium-api
    kubectl -n $ns rollout status deploy/tabularium-api --timeout=120s
    echo ""
    echo "✓ Reset complete. Open http://localhost:3000/init and click through the wizard."
    echo "  Bootstrap login: admin@example.com / \$BOOTSTRAP_PASSWORD (default: tabularium-dev)"

# Apply pending drizzle migrations against the in-cluster postgres.
migrate:
    kubectl -n tabularium-dev exec deploy/tabularium-api -- bun run migrate

# Seed the dev database.
seed:
    kubectl -n tabularium-dev exec deploy/tabularium-api -- bun run seed

# Open a psql shell against the dev postgres.
psql:
    kubectl -n tabularium-dev exec -it deploy/postgres -- psql -U tabularium -d tabularium

# Tail combined logs for api + frontend.
logs:
    kubectl -n tabularium-dev logs -f -l 'app in (tabularium-api,tabularium-frontend)' --max-log-requests=10

# Run the workspace test suite on the host (uses bun + turbo).
test:
    bun run test

# Run typecheck across the workspace on the host.
check:
    bun run check
