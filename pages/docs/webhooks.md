# Webhooks

A release webhook keeps submitted plugins up to date. Submitting a plugin only needs read access through the provider account; repository write access and webhook administration are optional. Tabularium tries to install the webhook with the permissions already granted. If that is not possible, submission still succeeds and the success page shows manual setup instructions, the webhook URL, and a generated secret.

The webhook fires when a release is published or updated and triggers:

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

## Optional automatic setup

Sign-in requests read-only scopes by default. On the submit page, **Allow automatic webhook setup (optional)** starts a separate authorization request for webhook installation:

- GitHub: `write:repo_hook`, without repository code-write access.
- GitLab: `api`, because creating project hooks needs write access to the API.
- Gitea: `write:repository`.

You can skip or decline this request and submit using the existing read-only connection. Accounts that already granted sufficient permissions can still get automatic installation. The provider account must still have maintainer access to the submitted repository; granting the app write access does not replace that ownership check.

## Manual setup

After a successful submission, use the URL and secret shown on the success page. No additional write permission needs to be granted to Tabularium.

1. Open the repository's webhook settings:
   - **GitHub:** Settings → Webhooks → Add webhook.
   - **GitLab:** Settings → Webhooks → Add new webhook.
   - **Gitea/Forgejo:** Settings → Webhooks → Add webhook → Gitea.
2. Paste the webhook URL below into **Payload URL** (GitHub) or **URL** (GitLab/Gitea).
3. Paste the generated secret into **Secret** (GitHub/Gitea) or **Secret token** (GitLab).
4. Select **application/json** where a content type selector is available.
5. Select only **Releases** events. On GitHub, choose **Let me select individual events** and enable **Releases**.
6. Keep the webhook active and SSL verification enabled, then save it.

```
URL:     https://registry.example.com/api/webhooks/release
Content: application/json
Secret:  <printed on submit success page>
Events:  Releases (only)
```

If your repository role does not allow editing webhook settings, ask a repository administrator to add the webhook with these values. You do not need to give Tabularium broader OAuth permissions for manual setup.

## Secret length

Webhook secrets must be **at least 32 characters**. Shorter secrets are rejected at HMAC-verify time (the request returns `401`) — even if the upstream provider accepted them. The registry auto-generates a 64-char hex secret on `POST /api/submit/oauth`, so OAuth-driven submissions are fine out of the box. Manually-created plugin webhooks need to use a secret of the same length; anything shorter will silently fail every release.

## Re-run

Admin → Plugins → Refresh manifest re-fetches the manifest synchronously (admin-only). Use it when you've edited `.tabularium` between releases.
