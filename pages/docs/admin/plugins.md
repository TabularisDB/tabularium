# Plugins

The admin plugin table covers every plugin in the registry, regardless of status.

## Statuses

- **approved** — visible everywhere, indexed by `/plugins`.
- **pending** — visible to the owner only; the navigation badge counts these.
- **rejected** — hidden; rejection reason is shown to the owner.

## Actions

| Action | Effect |
|--------|--------|
| Approve | Status → approved, plugin appears on `/plugins` |
| Reject (with reason) | Status → rejected, reason rendered on the owner's dashboard |
| Refresh manifest | Re-fetches `.tabularium` at HEAD; updates description, tags, README, screenshots |
| Webhook | Checks the repository release webhook and shows the URL, secret and settings for manual setup |
| Pin / feature | Marks the plugin for the home page featured slot, with an order index |
| Verify / unverify | Marks the plugin as audit-verified (see [Verification](#verification)) |
| Transfer | Initiates a transfer to another user (recipient gets a pending request on `/settings`) |
| Delete | Removes plugin + releases + transfer history (irreversible) |

On mobile, each plugin keeps a direct **Webhook** button and groups the remaining operations in the **Actions** menu. Desktop shows the full action bar, with consistent button sizes and labels.

## Verification

The Verified badge is an admin-issued trust signal. Use it to mark a plugin you've reviewed for code safety, manifest correctness, and signature integrity — distinct from the moderation `status`.

- **One click toggles the state.** The shield-check button in the admin row sets `verifiedAt` to now and `verifiedBy` to your admin user. A second click clears both.
- **Persistence is sticky.** A verified plugin stays verified through release webhooks, manifest refreshes, status changes, and owner transfers. New releases do not reset the badge — only an explicit admin action does. Re-verify after re-auditing.
- **Audit log.** Every transition writes `plugin.verify` or `plugin.unverify` to the audit log alongside the generic `plugin.update` entry. Idempotent re-submits (same value as current state) do not log.
- **Where it surfaces.**
  - Plugin detail page: badge next to the title, tooltip shows the verification date (admin identity is not exposed publicly).
  - Plugin cards on the home, `/plugins`, search, and kind catalogue pages: small shield-check icon next to the name.
  - `GET /api/plugins?verified=1` filters to verified plugins only.
  - Default sort places verified plugins ahead of unverified at equal underlying rank.
  - `GET /api/plugins/:slug` exposes `verified` (boolean) and `verifiedAt` (timestamp). `verifiedBy` is admin-only.

The state lives in two nullable columns (`verified_at`, `verified_by`) on `plugins`. `verified_at IS NULL` means unverified — there is no separate boolean column to drift out of sync.

## Webhooks

Each plugin row has a **Webhook** button. It checks the hooks installed in that plugin's repository using the owner's current OAuth token, and reports whether a hook points to this registry, is active, subscribes to release events, and sends JSON. A missing or expired token, insufficient permissions, or an upstream error is reported as an unavailable check, rather than a missing webhook.

The dialog always provides the expected payload URL, the existing plugin-specific secret (click **Show secret** to reveal and copy it), content type `application/json`, and the `release` event. **Open webhook settings** takes you to that repository's settings. On GitHub, add or edit the hook under **Settings → Webhooks**, select **Let me select individual events → Releases**, and keep **Active** checked. After saving, use **Check again** in the dialog.

The registry can show its own stored secret, so manual configuration does not require generating a replacement. GitHub does not return the secret saved on its side; the check cannot compare the two secrets or prove delivery succeeded. If necessary, paste the displayed registry secret into the GitHub webhook again. This dialog is admin-only and its response is not cached.

**Refresh manifest** re-fetches plugin metadata; **Replay latest release** imports the latest upstream release. Neither action installs a repository webhook.

Kinds (Themes, Snippets, SQL Templates, …) are managed separately under [Kinds](kinds.md). They surface as a tag on the plugin row and as a facet on the public catalog.
