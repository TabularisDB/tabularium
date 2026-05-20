# Deploy

Target cluster: **lyna** (k3s, single-node, public IP `164.68.114.26`).
Domain: **registry.spitzli.dev**, proxied via Cloudflare.

## Prereqs on the cluster

Already present on `lyna`:

- IngressClass `traefik` (k3s default, hostPort 80/443)
- ClusterIssuer `letsencrypt` (cert-manager) — optional, only if you switch to CF "Full (strict)"
- StorageClass `local-path` (default)

## One-time

1. **DNS** — point `registry.spitzli.dev` (A record) at `164.68.114.26`. Proxy via Cloudflare (orange cloud).
2. **OAuth callback URLs** — callbacks are per provider-instance: `https://registry.spitzli.dev/auth/<instance-id>/callback`. The instance ID is the slug you give the provider in `/admin/providers` (e.g. `github`, `codeberg`). Add the matching callback URL to each upstream OAuth app.
3. **Cloudflare SSL mode** — set to **Flexible** (origin HTTP). Or "Full" with the TLS block in `40-ingress.yaml` enabled + a cert-manager cert.

## Build + load image

The cluster pulls from local containerd (`imagePullPolicy: Never`), so the image must be imported on `lyna`.

```bash
# From repo root. Requires SSH access to lyna.
./deploy/build-image.sh dev

# Override host/user if needed:
K3S_HOST=lyna K3S_USER=root ./deploy/build-image.sh dev
```

This builds locally, saves a tarball, and imports it into `k3s ctr images`.

## Create the secret

```bash
kubectl -n tabularis-registry create secret generic registry-env \
  --from-literal=JWT_SECRET="$(openssl rand -hex 32)" \
  --from-literal=TOKEN_ENC_KEY="$(openssl rand -hex 32)" \
  --from-literal=GITHUB_CLIENT_ID="..." \
  --from-literal=GITHUB_CLIENT_SECRET="..." \
  --from-literal=CODEBERG_CLIENT_ID="..." \
  --from-literal=CODEBERG_CLIENT_SECRET="..."
```

`TOKEN_ENC_KEY` encrypts OAuth tokens (access + refresh) and the registry's release-signing private key at rest. Rotate it only via a planned key-rotation (re-encrypt) — losing it means re-linking every OAuth identity and rotating the release signing key.

The provider OAuth client envs are bootstrap-only — admins can add / replace provider instances via the `/admin/providers` UI after first boot.

`BASE_URL`, `WEB_BASE_URL`, `PORT`, `NODE_ENV`, `LOG_LEVEL`, `DATABASE_URL` are set in the Deployment.

## Apply manifests

```bash
kubectl apply -f deploy/k8s/00-namespace.yaml
# (secret created above)
kubectl apply -f deploy/k8s/10-pvc.yaml
kubectl apply -f deploy/k8s/20-deployment.yaml
kubectl apply -f deploy/k8s/30-service.yaml
kubectl apply -f deploy/k8s/40-ingress.yaml

# or all at once:
kubectl apply -f deploy/k8s/
```

## Verify

```bash
kubectl -n tabularis-registry get pods,svc,ingress
kubectl -n tabularis-registry logs -f deploy/registry
curl -H "Host: registry.spitzli.dev" http://164.68.114.26/openapi/json
```

After CF DNS propagation: open <https://registry.spitzli.dev>.

## Update image after code changes

```bash
./deploy/build-image.sh dev
kubectl -n tabularis-registry rollout restart deploy/registry
```
