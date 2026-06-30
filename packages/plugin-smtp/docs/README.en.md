# plugin-smtp

Generic SMTP transport for the Tabularium email domain. Registers against the `email-provider` extension point. Use this when you already operate an SMTP relay (Postfix, Postal, SendGrid SMTP, your ISP's gateway) and don't want or can't run a TurboSMTP account.

## What it does

- **Sends** outbound mail via `nodemailer` using STARTTLS or implicit TLS — driven entirely by host/port/credentials in plugin settings.
- **Verifies** connectivity from the admin email page with a "Test connection" probe before you commit credentials.

## How

`buildSmtpProvider(host)` reads settings (`smtpHost`, `smtpPort`, `smtpUser`, `smtpPass`, `smtpFrom`), constructs a `nodemailer` transporter, and exposes a single `send()` method. There is no suppression-source plugin contributed by SMTP — generic SMTP servers don't have a uniform suppression API, so `plugin-email` falls back to maintaining suppression manually (operator-curated through `/admin/email/suppression`).

## Why

Not every operator wants a third-party provider in the loop. SMTP is the universal escape hatch: any compliant relay works. It also makes air-gapped Tabularium installs possible — point at an internal Postfix and you're shipping mail without ever talking to the public internet.

## Related

- `plugin-email` — orchestrator; this plugin requires it.
- `plugin-turbosmtp` — first-party provider with bootstrap + suppression sync.
