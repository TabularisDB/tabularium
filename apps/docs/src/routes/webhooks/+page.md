---
title: "Webhooks"
---

# Webhooks

Tabularium installs a release webhook on every submitted repo. The webhook fires when a new release/tag is published and triggers:

1. Re-fetch the `.tabularium` manifest at the tagged ref.
2. Re-render the README.
3. Insert a `releases` row with the version, asset list, and minimum runtime version.

## URL

```
POST /api/webhooks/release
```

The plugin's `webhookSecret` is sent as the signature header (provider-specific):

- GitHub: `X-Hub-Signature-256`
- GitLab: `X-Gitlab-Token`
- Gitea: `X-Gitea-Signature`

## Manual setup

If automatic installation fails (insufficient OAuth scope, on-prem firewall), the submit page returns the URL + secret. Add them by hand in your repo's webhook settings:

```
URL:     https://registry.example.com/api/webhooks/release
Content: application/json
Secret:  <printed on submit success page>
Events:  Releases (only)
```

## Secret length

Webhook secrets must be **at least 32 characters**. Shorter secrets are rejected at HMAC-verify time (the request returns `401`) — even if the upstream provider accepted them. The registry auto-generates a 64-char hex secret on `POST /api/submit/oauth`, so OAuth-driven submissions are fine out of the box. Manually-created plugin webhooks need to use a secret of the same length; anything shorter will silently fail every release.

## Re-run

Admin → Plugins → Refresh manifest re-fetches the manifest synchronously (admin-only). Use it when you've edited `.tabularium` between releases.
