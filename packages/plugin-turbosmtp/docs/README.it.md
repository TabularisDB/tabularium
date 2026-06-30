# plugin-turbosmtp

Trasporto TurboSMTP per il dominio email di Tabularium. Si registra sui punti di estensione `email-provider`, `email-bootstrap-driver` e `email-suppression-source`.

## Cosa fa

- **Invia** posta in uscita tramite autenticazione `consumer_key` contro l'API REST di TurboSMTP.
- **Bootstrap** di nuove istanze dalle credenziali dell'account TurboSMTP dell'operatore.
- **Sincronizza** la lista di suppression upstream verso `email_suppression` con croner.
- **Espone** un pannello admin in `/admin/email/turbosmtp` con sparkline di consegna 24h, engagement, lista suppression, credenziali mascherate e un wizard di onboarding in 3 step.

## Come

`buildTurboProvider(host)` legge le credenziali da `host.settings` e costruisce un client `TurboSmtp`. Il provider non ha stato proprio — `plugin-email` possiede il log, il DB di suppression e i template.

## Perché

TurboSMTP è il default di sviluppo: bootstrap OAuth-like documentato, API suppression compatibile, tier gratuito sufficiente per una demo.

## Disattivazione sicura

Disattiva in ordine di dipendenza: prima questo plugin, poi `plugin-email`.

## Correlati

- `plugin-email` — orchestratore; questo plugin lo richiede.
- `plugin-smtp` — alternativa SMTP generica.
