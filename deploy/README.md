# Deploy

Tabularium ships as a Helm chart at [`deploy/helm/tabularium/`](./helm/tabularium/). Works on any k8s / k3s cluster — Traefik is the default ingress (matches k3s out of the box). The reference install below targets `lyna` (k3s, single-node, public IP `164.68.114.26`) with `registry.spitzli.dev` proxied via Cloudflare.

```bash
helm install registry deploy/helm/tabularium \
  --namespace tabularis-registry --create-namespace \
  --values my-values.yaml
```

A `my-values.yaml` for the reference install:

```yaml
image:
  tag: "0.1.0"

config:
  baseUrl: https://registry.spitzli.dev
  webBaseUrl: https://registry.spitzli.dev
  databaseMode: sqlite      # PVC-backed SQLite. For Postgres/MySQL see below.

persistence:
  size: 5Gi
  storageClass: local-path  # k3s default

ingress:
  enabled: true
  className: ""             # k3s: empty → traefik
  annotations:
    # Cloudflare proxies + terminates client TLS; origin serves HTTP only.
    traefik.ingress.kubernetes.io/router.entrypoints: web
  hosts:
    - host: registry.spitzli.dev
      paths:
        - path: /
          pathType: Prefix

secrets:
  jwtSecret: "<openssl rand -hex 32>"
  tokenEncKey: "<openssl rand -hex 32>"
```

Or wire your own pre-existing Secret:

```yaml
secrets:
  existingSecret: registry-env   # must contain JWT_SECRET, TOKEN_ENC_KEY, optionally BOOTSTRAP_EMAIL + provider OAuth client envs
```

`TOKEN_ENC_KEY` encrypts OAuth tokens and the release-signing private key at rest. Rotate it only via a planned key-rotation (re-encrypt) — losing it means re-linking every OAuth identity and rotating the release signing key.

## Prereqs on the cluster

For the lyna reference install:

- IngressClass `traefik` (k3s default)
- StorageClass `local-path` (k3s default)
- Optional: ClusterIssuer `letsencrypt` (cert-manager) for direct-origin TLS

## One-time

1. **DNS** — point `registry.spitzli.dev` (A record) at the cluster IP. Proxy via Cloudflare (orange cloud).
2. **OAuth callback URLs** — callbacks are per provider-instance: `https://<host>/auth/<instance-id>/callback`. The instance ID is the slug you give the provider in `/admin/providers`. Add the matching callback URL to each upstream OAuth app.
3. **Cloudflare SSL mode** — set to **Flexible** (origin HTTP). Or "Full (strict)" with direct-origin TLS — uncomment the `ingress.tls` block in `my-values.yaml` and add `cert-manager.io/cluster-issuer: letsencrypt` to `ingress.annotations`.

## Build + push image

CI (`.forgejo/workflows/docker-build.yml`) handles this. It runs on:

- `release: published` → tags the image with `vX.Y.Z`, `latest`, and the commit SHA
- `workflow_dispatch` → tags it as `dev-<short-sha>`

For ad-hoc local builds, run `docker build -t tabularium:dev .` and either push to the codeberg registry yourself or import directly into k3s containerd with `docker save | ssh lyna sudo k3s ctr images import -`.

## External database (Postgres / MySQL)

```yaml
config:
  databaseMode: external
  databaseUrl: postgres://tabularium:secret@postgres.default.svc:5432/tabularium

persistence:
  enabled: false
```

The chart does **not** run migrations automatically in external mode. After the first rollout:

```bash
kubectl -n tabularis-registry exec deploy/registry-tabularium -- bun run migrate
```

## Verify

```bash
kubectl -n tabularis-registry get pods,svc,ingress
kubectl -n tabularis-registry logs -f deploy/registry-tabularium
```

## Upgrade

```bash
helm upgrade registry deploy/helm/tabularium \
  --namespace tabularis-registry \
  --reuse-values --set image.tag=0.2.0
```

## Local development

`just dev` brings the whole stack up on minikube via Tilt (separate from this chart — see [Tiltfile](../Tiltfile) and [`deploy/dev/`](./dev/)).
