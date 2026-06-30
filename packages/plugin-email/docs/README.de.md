# plugin-email

Der Orchestrator für die Email-Domain. Verwaltet Templates, Versand, Empfänger-State und das Operator-UI — bringt aber **keinen** Transport mit. Ein Provider-Plugin (z.B. `plugin-turbosmtp` oder `plugin-smtp`) liefert den eigentlichen Send-Pfad über den `email-provider` Extension-Point.

## Was es macht

- **Rendert** transaktionale Emails aus MJML-Templates (welcome, plugin approved/rejected, unsubscribe-Bestätigung).
- **Sendet** über den jeweils aktiven `email-provider`, mit passivem Queue-Fallback wenn keiner konfiguriert ist (das Registry crasht nie wegen fehlendem Transport).
- **Loggt** jeden Send in `email_log` für Diagnostik + per-Empfänger Suppression-Checks.
- **Erzwingt** Unsubscribe-Preferences: per-Template `email_preferences`, globale `email_suppression`, und List-Unsubscribe Headers für die Mailbox-Provider.
- **Exposed** eine Admin-Settings-Page (`/admin/email`), eine Admin-Suppression-Liste (`/admin/email/suppression`), und ein token-authentifiziertes User-Preference-Center (`/email/unsubscribe/[token]`).

## Wie

`sendEmail()` ist die einzige Fassade. Sie löst den aktiven Provider über die Kernel-Registry auf, läuft Suppression- + Preference-Gates, rendert das Template mit Empfänger-Locale, und schreibt die Audit-Row vor/nach dem Upstream-Call. Subscriber auf dem Event-Bus (`account.welcome`, `plugin.approved`, `plugin.rejected`) emittieren Events; dieses Plugin hört zu und dispatcht.

Provider-Plugins registrieren sich beim Boot via `host.registry.register('email-provider', name, impl)`. Sie importieren `plugin-email` nie direkt — der Kernel ist die einzige Naht.

## Warum

Email ist die Leitung zwischen Tabularium und Menschen (welcome, plugin reviews, unsubscribes). Zentralisierter Delivery bedeutet, dass wir nur an einer Stelle auditen, gaten und rendern; TurboSMTP gegen einen In-House-SMTP-Server tauschen ist ein Provider-Plugin-Wechsel, kein Core-Refactor. Operators sehen eine Settings-Page, egal welcher Transport gerade aktiv ist.

## Verwandt

- `plugin-turbosmtp` — Primärer TurboSMTP-Provider + Suppression-Sync.
- `plugin-smtp` — Generischer SMTP-Fallback.
- Kernel-Docs: `email-provider`, `email-bootstrap-driver`, `email-suppression-source` Extension-Points.
