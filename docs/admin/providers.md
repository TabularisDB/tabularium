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

1. **GitHub** — Settings → Developer settings → OAuth Apps → New OAuth App. Authorization callback URL: `https://<registry>/auth/<provider-id>/callback`.
2. **GitLab** — Preferences → Applications → New application. Scopes: `read_user`, `read_repository`, `write_repository` (for webhook install).
3. **Gitea** — Settings → Applications → New OAuth app. Redirect URI: same callback as above. Scope: `read:user`, `write:repository`.

Save the client ID + secret in `/admin/providers`. Tabularium tests the OAuth round-trip on first sign-in.

## Tokens

User access tokens are encrypted with the JWT secret and stored on the `identities` table. When a user re-authorises, the token is rotated.
