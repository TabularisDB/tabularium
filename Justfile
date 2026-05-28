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
    if pgrep -x tilt >/dev/null; then
      echo "tilt is already running — open http://localhost:10350"
    else
      tilt up
    fi

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
    echo "→ Bringing tabularium-api back up..."
    kubectl -n $ns scale deploy/tabularium-api --replicas=1
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
