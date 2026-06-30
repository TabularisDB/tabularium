# plugin-smtp

Generischer SMTP-Transport für die Tabularium Email-Domain. Registriert sich gegen den `email-provider` Extension-Point. Verwende ihn wenn du bereits ein SMTP-Relay (Postfix, Postal, SendGrid SMTP, ISP-Gateway) betreibst und keinen TurboSMTP-Account willst.

## Was es macht

- **Sendet** Outbound-Mail via `nodemailer` mit STARTTLS oder implicit TLS — gesteuert durch host/port/credentials in den Plugin-Settings.
- **Verifiziert** Konnektivität von der Admin-Email-Page mit einem "Test connection"-Probe vor dem Commit der Credentials.

## Wie

`buildSmtpProvider(host)` liest Settings (`smtpHost`, `smtpPort`, `smtpUser`, `smtpPass`, `smtpFrom`), baut einen `nodemailer`-Transporter und exponiert eine `send()`-Methode. SMTP contributed keinen Suppression-Source — generische SMTP-Server haben keine einheitliche Suppression-API, also fällt `plugin-email` darauf zurück, Suppression manuell zu pflegen (Operator-curated via `/admin/email/suppression`).

## Warum

Nicht jeder Operator will einen Third-Party-Provider in der Schleife. SMTP ist das universelle Notausgang: jeder konforme Relay funktioniert. Macht auch air-gapped Tabularium-Installs möglich — auf einen internen Postfix zeigen und du verschickst Mail ohne je das öffentliche Internet zu kontaktieren.

## Verwandt

- `plugin-email` — Orchestrator; dieses Plugin requires ihn.
- `plugin-turbosmtp` — First-party Provider mit Bootstrap + Suppression-Sync.
