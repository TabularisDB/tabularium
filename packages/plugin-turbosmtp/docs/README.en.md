# plugin-turbosmtp

TurboSMTP transport for the Tabularium email domain. Registers against the `email-provider`, `email-bootstrap-driver`, and `email-suppression-source` extension points so `plugin-email` can deliver mail, walk operators through onboarding with just an email + password, and keep its suppression list in sync.

## What it does

- **Sends** outbound mail through `consumer_key` authentication against the TurboSMTP REST API.
- **Bootstraps** new instances from the operator's TurboSMTP account credentials (creates a consumer key on first run, verifies, and writes settings — no copy/paste of secrets).
- **Syncs** the upstream suppression list (`unsubscribes`, `bounces`, `complaints`) into `email_suppression` on a croner schedule, so a bounce at TurboSMTP becomes a gate at `sendEmail()`.
- **Exposes** a bespoke admin panel at `/admin/email/turbosmtp` with: 24h delivery sparkline, engagement (opens/clicks/unsubs), suppression-list size + manual "Sync now" button, masked credentials with a debounced test-connection validator, and a 3-step onboarding wizard.

## How

`buildTurboProvider(host)` reads the credentials from `host.settings`, lazily builds a `TurboSmtp` client, and exposes `send()`, `verifyAuth()`, `analytics.list()`, and `consumerKeys.*` methods to the consumers. The provider does not own state — `plugin-email` owns the `email_log`, the suppression DB, and templates.

The suppression sync is a croner-scheduled job registered by `register(host)`. It pulls in pages of 200 entries from `client.suppression.list()`, upserts into `email_suppression`, and emits an audit row.

## Why

TurboSMTP is the dev-environment default because (a) it's the only first-party provider with a documented OAuth-style bootstrap, (b) its suppression API matches what `plugin-email` needs verbatim, and (c) the free tier is enough for an instance bootstrap demo. The bespoke admin page exists so an operator can verify deliverability without leaving the Tabularium admin.

## Disable safely

Plugins that declare `requires: ['email']` (this one) cannot be disabled while their dependency is active — and `plugin-email` won't disable while `plugin-turbosmtp` is enabled. Disable in dependency order: this first, then `plugin-email`.

## Related

- `plugin-email` — orchestrator; this plugin requires it.
- `plugin-smtp` — generic SMTP alternative.
