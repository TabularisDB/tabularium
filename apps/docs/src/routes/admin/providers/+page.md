---
title: "Providers"
---

# Providers

Providers are the upstream code hosts users sign in with. Each provider entry is one OAuth app — you can register multiple GitHub instances (e.g. github.com + GitHub Enterprise), multiple Gitea instances, etc.

## Fields

| Field | What |
|-------|------|
| Kind | `github`, `gitlab`, or `gitea` |
| Display name | Shown on `/login` and `/submit` |
| Base URL | Public URL of the instance (e.g. `https://github.com`, `https://gitea.example.com`) |
| Client ID / Secret | OAuth app credentials. Secret is encrypted at rest. |
| Logo URL | Optional override of the built-in icon |
| Enabled | Disabled providers hide from the login screen |

## Setting up the OAuth app

Use `https://<registry>/auth/<provider-id>/callback` as the authorization callback URL for each provider.

1. **GitHub** — Settings → Developer settings → OAuth Apps → New OAuth App. Default requested scopes: `read:user`, `read:org`.
2. **GitLab** — Preferences → Applications → New application. Enable `read_user` and `read_api` for sign-in and submission. Enable `api` on the OAuth app only if users should also be able to opt into automatic webhook installation.
3. **Gitea** — Settings → Applications → New OAuth app. Default requested scopes: `read:user`, `read:repository`, `read:organization`.

Save the client ID + secret in `/admin/providers`. Tabularium tests the OAuth round-trip on first sign-in.

## Optional write permissions

Submission does not require repository write access or webhook administration scopes. The provider account must still be a maintainer or owner of the repository; this check is separate from the permissions granted to Tabularium.

The submit page offers a separate, optional authorization request for automatic webhook setup (`/auth/<provider-id>?link=1&scope=webhook`):

| Provider | Additional scope | Access granted |
|----------|------------------|----------------|
| GitHub | `write:repo_hook` | Create and update repository webhooks, without writing repository code |
| GitLab | `api` | Read/write API access, including project webhook creation |
| Gitea | `write:repository` | Read/write repository API access, including webhook creation |

Users can skip or decline this request. Submission still succeeds, and the success page explains how to configure the webhook manually using its URL and secret. Existing tokens with sufficient permissions can still install it automatically.

Creating a scaffolded GitHub repository is a separate write operation. It requests `public_repo` and `workflow` only when needed to create the repository and its CI workflow.

See the provider scope references: [GitHub OAuth scopes](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps), [GitLab OAuth scopes](https://docs.gitlab.com/integration/oauth_provider/), and [Gitea OAuth scopes](https://docs.gitea.com/development/oauth2-provider/).

## Tokens

User access tokens are encrypted with `TOKEN_ENC_KEY` (AES-256-GCM) and stored on the `identities` table. When a user re-authorises, the token is rotated. Existing grants are not automatically revoked by the change to read-only defaults; users can revoke the app in their provider settings and reconnect to remove permissions granted earlier.
