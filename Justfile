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
