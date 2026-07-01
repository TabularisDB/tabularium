---
title: "Plugins"
---

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
| Pin / feature | Marks the plugin for the home page featured slot, with an order index |
| Verify / unverify | Marks the plugin as audit-verified (see [Verification](#Verification)) |
| Transfer | Initiates a transfer to another user (recipient gets a pending request on `/settings`) |
| Delete | Removes plugin + releases + transfer history (irreversible) |

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

If a webhook fails to install during submission, the admin Refresh button installs it again using the owner's current access token.

Kinds (Themes, Snippets, SQL Templates, …) are managed separately under [Kinds](/admin/kinds/). They surface as a tag on the plugin row and as a facet on the public catalog.
