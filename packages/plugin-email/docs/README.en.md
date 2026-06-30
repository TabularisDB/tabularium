# plugin-email

The orchestrator for the email domain. It owns templates, delivery, recipient state, and the operator UI — but does **not** ship a transport. A provider plugin (e.g. `plugin-turbosmtp` or `plugin-smtp`) supplies the actual send path through the `email-provider` extension point.

## What it does

- **Renders** transactional emails from MJML templates (welcome, plugin approved/rejected, unsubscribe confirmation).
- **Sends** via whichever `email-provider` is active, with a passive queue fallback when none is configured (so the registry never crashes for lack of a transport).
- **Tracks** every send in `email_log` for diagnostics + per-recipient suppression checks.
- **Enforces** unsubscribe preferences: per-template `email_preferences`, global `email_suppression`, and List-Unsubscribe headers for inbox providers.
- **Exposes** an admin settings page (`/admin/email`), an admin suppression list (`/admin/email/suppression`), and a token-authenticated user preference center (`/email/unsubscribe/[token]`).

## How

`sendEmail()` is the single facade. It resolves the active provider through the kernel registry, runs suppression + preference gates, renders the template with the recipient's locale, and writes the audit row before/after the upstream call. Subscribers on the event bus (`account.welcome`, `plugin.approved`, `plugin.rejected`) emit events; this plugin listens and dispatches.

Provider plugins register themselves at boot via `host.registry.register('email-provider', name, impl)`. They never import `plugin-email` directly — the kernel is the only seam.

## Why

Email is the wire between Tabularium and humans (welcome, plugin reviews, unsubscribes). Centralising delivery means we only audit, gate, and render in one place; swapping TurboSMTP for an in-house SMTP server is a provider-plugin change, not a core refactor. Operators see one settings page no matter which transport is active.

## Related

- `plugin-turbosmtp` — primary TurboSMTP provider + suppression sync.
- `plugin-smtp` — generic SMTP fallback.
- Kernel docs: `email-provider`, `email-bootstrap-driver`, `email-suppression-source` extension points.
