---
title: "Helm"
---

# Helm

A first-party chart lives at `deploy/helm/tabularium` in the repo. It renders a
Deployment, Service, Ingress, optional PVC, an optional chart-managed Secret,
ServiceAccount, and an optional HPA — with non-root, read-only-rootfs security
contexts baked in.

The chart isn't published to a Helm repo yet, so install from a checkout:

```bash
git clone https://github.com/TabularisDB/tabularium
cd tabularium
```

## Quick start

Generate the two required secrets, then install into a namespace. The chart's
`values.yaml` still points `image.repository` at the old Codeberg registry —
override it to the published GHCR image:

```bash
helm install registry ./deploy/helm/tabularium \
  --namespace tabularium --create-namespace \
  --set image.repository=ghcr.io/tabularisdb/tabularium \
  --set config.baseUrl=https://registry.example.com \
  --set config.webBaseUrl=https://registry.example.com \
  --set ingress.hosts[0].host=registry.example.com \
  --set secrets.jwtSecret=$(openssl rand -hex 32) \
  --set secrets.tokenEncKey=$(openssl rand -hex 32)
```

First boot writes the bootstrap admin password to the logs:

```bash
kubectl -n tabularium logs -f deploy/registry-tabularium
```

Sign in with `admin@example.com` + that password and the install wizard walks
you through the rest. No ingress? Port-forward instead:

```bash
kubectl -n tabularium port-forward svc/registry-tabularium 3000:80
```

## Secrets

`JWT_SECRET` and `TOKEN_ENC_KEY` are mandatory in production — without them the
app generates ephemeral keys at boot, invalidating every session and stored
OAuth token on each restart.

Two ways to supply them:

- **Chart-managed** (dev-friendly): `--set secrets.jwtSecret=… --set secrets.tokenEncKey=…`. The chart renders a Secret named `<release>-tabularium`.
- **Existing secret** (production): manage the Secret out-of-band (sealed-secrets, sops, External Secrets) and reference it wholesale with `--set secrets.existingSecret=my-secret`. Its keys are loaded via `envFrom`, so it can also carry OAuth client secrets.

`TOKEN_ENC_KEY` must be exactly 64 hex chars (AES-256-GCM). `JWT_SECRET` must be
≥32 chars and not the placeholder `change-me-in-production`.

## Database mode

`config.databaseMode` picks the storage backend:

| Value | Behaviour |
|-------|-----------|
| `sqlite` (default) | SQLite on the PVC at `config.dataDir` (`/data`). **Pins `replicaCount` to 1** — no shared-filesystem semantics — and rules out the HPA. |
| `external` | Set `config.databaseUrl` to a `postgres://…` or `mysql://…` DSN. Run migrations after the first rollout: `kubectl exec deploy/registry-tabularium -- bun run migrate`. |

For a self-contained Postgres, flip on the bundled Bitnami subchart instead of
running your own:

```bash
--set config.databaseMode=external \
--set postgresql.enabled=true \
--set config.databaseUrl=postgres://tabularium@registry-tabularium-postgresql:5432/tabularium
```

There's a matching `dragonfly.enabled` subchart (Redis-compatible cache); pair
it with `--set config.cacheDriver=redis` and point `REDIS_URL` at the service.

## Persistence

A PVC mounts at `config.dataDir` (`/data`) and holds the SQLite DB (in `sqlite`
mode) plus uploaded branding/plugin assets when the storage driver is `disk`.

| Key | Default | Notes |
|-----|---------|-------|
| `persistence.enabled` | `true` | Disable **only** if you run both an external DB and S3-compatible storage — otherwise pod restarts lose uploads. |
| `persistence.size` | `5Gi` | |
| `persistence.storageClass` | `""` | Empty = cluster default. |
| `persistence.existingClaim` | `""` | Bind an existing PVC and skip chart creation. |

## Ingress

k3s ships Traefik — leave `ingress.className` empty and it's picked up
automatically. TLS via cert-manager is a commented recipe in `values.yaml`:

```bash
--set ingress.annotations."cert-manager\.io/cluster-issuer"=letsencrypt \
--set ingress.tls[0].hosts[0]=registry.example.com \
--set ingress.tls[0].secretName=registry-tls
```

The container serves the SPA, API (`/api`), OAuth callbacks (`/auth`), OpenAPI
(`/openapi`) and uploads (`/uploads`) all under `/` — no path-based routing.

## Scaling

The HPA (`autoscaling.enabled`) is off by default. Only enable it in `external`
database mode — SQLite mode can't scale horizontally:

```bash
--set config.databaseMode=external \
--set autoscaling.enabled=true \
--set autoscaling.maxReplicas=5
```

## Common values

| Key | Default | Notes |
|-----|---------|-------|
| `image.repository` | `codeberg.org/tabularium/tabularium` | Override to `ghcr.io/tabularisdb/tabularium`. |
| `image.tag` | `""` | Falls back to the chart's `appVersion`. |
| `replicaCount` | `1` | Ignored (forced to 1) in `sqlite` mode. |
| `config.baseUrl` / `config.webBaseUrl` | `https://registry.example.com` | Public origins for OAuth callbacks + webhook URLs. |
| `config.logLevel` | `info` | |
| `resources` | 50m/128Mi → 500m/512Mi | requests → limits. |
| `service.type` / `service.port` | `ClusterIP` / `80` | targetPort defaults to `config.port` (3000). |
| `existingEnvSecret` | `""` | Extra Secret loaded via `envFrom` (OAuth client secrets, etc.). |

Full reference: `deploy/helm/tabularium/values.yaml`.

## Upgrade & uninstall

```bash
# reuse previously-set values, bump the image tag
helm upgrade registry ./deploy/helm/tabularium --reuse-values --set image.tag=0.13.0

helm uninstall registry -n tabularium
```

`helm uninstall` leaves PVCs behind by design — delete `registry-tabularium-data`
manually if you really want the data gone.
