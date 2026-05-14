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
| Transfer | Initiates a transfer to another user (recipient gets a pending request on `/settings`) |
| Delete | Removes plugin + releases + transfer history (irreversible) |

## Webhooks

If a webhook fails to install during submission, the admin Refresh button installs it again using the owner's current access token.
