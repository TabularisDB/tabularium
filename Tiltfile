# Tabularium local dev stack — minikube + Tilt.
#
# Quickstart:  `just dev` (starts minikube profile + tilt up)
# Manual:      `tilt up`        — bring everything up (assumes minikube already running)
#              `tilt down`      — tear down the workloads (PVCs survive)
#              `tilt trigger <resource>` — kick a one-off build
#
# Layout:
#   - deploy/dev/*.yaml hold the static manifests (namespace, postgres,
#     dragonfly, api, frontend, migrate Job)
#   - scripts/render-k8s-env.ts emits the tabularium-env Secret from .env files
#     so changes to any .env trigger an automatic re-apply
#   - docker_build() targets stream source into the cluster via Tilt's
#     live_update — bun --hot picks up api changes, vite HMR picks up frontend.
#
# Safety net: only the local "tabularium" minikube context is allowed; Tilt
# refuses to talk to any other cluster.

allow_k8s_contexts(["tabularium", "minikube"])

env_deps = [
    ".env.example",
    ".env",
    "apps/api/.env.example",
    "apps/api/.env",
    "apps/frontend/.env.example",
    "apps/frontend/.env",
    "scripts/render-k8s-env.ts",
]

for env_file in env_deps:
    watch_file(env_file)

k8s_yaml([
    "deploy/dev/namespace.yaml",
    "deploy/dev/postgres.yaml",
    "deploy/dev/dragonfly.yaml",
    local("bun scripts/render-k8s-env.ts"),
    "deploy/dev/db-migrate-job.yaml",
    "deploy/dev/api.yaml",
    "deploy/dev/frontend.yaml",
])

# Files that should trigger a fresh `bun install` rather than a live sync.
workspace_inputs = [
    "package.json",
    "bun.lock",
    "turbo.json",
    "apps/api/package.json",
    "apps/frontend/package.json",
    "packages/client/package.json",
    "packages/cli/package.json",
    "packages/manifest/package.json",
    "packages/tsconfig/package.json",
]

docker_build(
    "tabularium-api",
    ".",
    dockerfile="apps/api/Dockerfile.dev",
    only=workspace_inputs + [
        "apps/api",
        "packages/client",
        "packages/manifest",
        "packages/tsconfig",
    ],
    ignore=[
        "apps/api/data",
        "apps/api/.cache",
        "**/node_modules",
        "**/dist",
        "**/.turbo",
    ],
    live_update=[
        sync("./apps/api/src", "/repo/apps/api/src"),
        sync("./apps/api/index.ts", "/repo/apps/api/index.ts"),
        sync("./packages/manifest/src", "/repo/packages/manifest/src"),
        sync("./packages/client/src", "/repo/packages/client/src"),
        # The api imports @tabularium/manifest from its dist/ — rebuild on src change.
        run(
            "cd /repo/packages/manifest && bun run build",
            trigger=["./packages/manifest/src"],
        ),
    ],
)

docker_build(
    "tabularium-frontend",
    ".",
    dockerfile="apps/frontend/Dockerfile.dev",
    only=workspace_inputs + [
        "apps/api",
        "apps/frontend",
        "packages/client",
        "packages/manifest",
        "packages/tsconfig",
    ],
    ignore=[
        "**/node_modules",
        "**/dist",
        "**/.turbo",
        "**/.svelte-kit",
    ],
    live_update=[
        sync("./apps/frontend/src", "/repo/apps/frontend/src"),
        sync("./apps/frontend/static", "/repo/apps/frontend/static"),
        sync("./apps/frontend/vite.config.ts", "/repo/apps/frontend/vite.config.ts"),
        sync("./apps/frontend/svelte.config.js", "/repo/apps/frontend/svelte.config.js"),
        sync("./packages/client/src", "/repo/packages/client/src"),
    ],
)

k8s_resource("postgres", port_forwards=5432, labels=["infra"])
k8s_resource("dragonfly", port_forwards=6379, labels=["infra"])
k8s_resource(
    "db-migrate",
    resource_deps=["postgres"],
    labels=["db"],
)
k8s_resource(
    "tabularium-api",
    port_forwards=3000,
    resource_deps=["db-migrate", "dragonfly"],
    pod_readiness="wait",
    labels=["apps"],
)
k8s_resource(
    "tabularium-frontend",
    port_forwards=5180,
    resource_deps=["tabularium-api"],
    pod_readiness="wait",
    labels=["apps"],
)
