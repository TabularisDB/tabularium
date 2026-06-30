# plugin-email

L'orchestratore del dominio email. Gestisce template, consegna, stato dei destinatari e la UI dell'operatore — ma **non** include un trasporto. Un plugin provider (p. es. `plugin-turbosmtp` o `plugin-smtp`) fornisce il percorso di invio reale tramite il punto di estensione `email-provider`.

## Cosa fa

- **Renderizza** email transazionali da template MJML (welcome, plugin approvato/rifiutato, conferma di cancellazione).
- **Invia** tramite il `email-provider` attivo, con coda passiva di fallback quando nessuno è configurato.
- **Traccia** ogni invio in `email_log` per diagnostica + verifiche di suppression per destinatario.
- **Applica** le preferenze di disiscrizione: `email_preferences` per template, `email_suppression` globale, header List-Unsubscribe.
- **Espone** una pagina admin (`/admin/email`), lista suppression (`/admin/email/suppression`) e centro preferenze autenticato via token (`/email/unsubscribe/[token]`).

## Come

`sendEmail()` è l'unica facciata. Risolve il provider attivo tramite il registry del kernel, esegue i gate di suppression + preferenze, renderizza il template con la locale del destinatario, e scrive la riga di audit prima/dopo la chiamata upstream. I subscriber del bus eventi (`account.welcome`, `plugin.approved`, `plugin.rejected`) emettono eventi; questo plugin li ascolta e dispatcha.

## Perché

L'email è il cavo tra Tabularium e gli umani. Centralizzare la consegna significa auditare, gestire e renderizzare in un solo punto; sostituire TurboSMTP con un server SMTP interno è un cambio di plugin provider, non un refactoring del core.

## Correlati

- `plugin-turbosmtp` — provider principale.
- `plugin-smtp` — fallback SMTP generico.
