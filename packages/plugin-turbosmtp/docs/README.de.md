# plugin-turbosmtp

TurboSMTP-Transport für die Tabularium Email-Domain. Registriert sich gegen die `email-provider`, `email-bootstrap-driver` und `email-suppression-source` Extension-Points, damit `plugin-email` Mail ausliefern, Operators mit Email+Passwort durchs Onboarding führen, und seine Suppression-Liste synchron halten kann.

## Was es macht

- **Sendet** Outbound-Mail via `consumer_key`-Auth gegen die TurboSMTP REST API.
- **Bootstrapped** neue Instanzen aus den TurboSMTP-Account-Credentials des Operators (erzeugt beim ersten Run einen Consumer-Key, verifiziert, schreibt Settings — kein Copy/Paste von Secrets).
- **Synct** die upstream Suppression-Liste (`unsubscribes`, `bounces`, `complaints`) per croner-Schedule nach `email_suppression`.
- **Exposed** ein bespoke Admin-Panel unter `/admin/email/turbosmtp` mit: 24h-Delivery-Sparkline, Engagement (Opens/Clicks/Unsubs), Suppression-Größe + "Sync jetzt"-Button, maskierten Credentials mit debounced Test-Connection, und einem 3-step Onboarding-Wizard.

## Wie

`buildTurboProvider(host)` liest die Credentials aus `host.settings`, baut lazy einen `TurboSmtp`-Client und exponiert `send()`, `verifyAuth()`, `analytics.list()` und `consumerKeys.*`. Der Provider besitzt keinen eigenen State — `plugin-email` besitzt das `email_log`, die Suppression-DB und Templates.

Der Suppression-Sync ist ein croner-scheduled Job, der von `register(host)` registriert wird. Er pullt seitenweise 200 Einträge aus `client.suppression.list()`, upsertet in `email_suppression` und emittiert eine Audit-Row.

## Warum

TurboSMTP ist der Dev-Default weil (a) es der einzige first-party Provider mit dokumentiertem OAuth-style Bootstrap ist, (b) die Suppression-API genau das matched was `plugin-email` braucht, und (c) der Free-Tier für eine Bootstrap-Demo reicht. Die bespoke Admin-Page existiert damit Operators die Zustellbarkeit verifizieren können, ohne den Tabularium-Admin zu verlassen.

## Sicheres Deaktivieren

Plugins die `requires: ['email']` deklarieren (dieses hier) können nicht deaktiviert werden während ihre Dependency aktiv ist — und `plugin-email` lässt sich nicht deaktivieren während `plugin-turbosmtp` enabled ist. Deaktiviere in Dependency-Reihenfolge: erst dieses, dann `plugin-email`.

## Verwandt

- `plugin-email` — Orchestrator; dieses Plugin requires ihn.
- `plugin-smtp` — Generische SMTP-Alternative.
