# plugin-smtp

Trasporto SMTP generico per il dominio email di Tabularium. Si registra sul punto di estensione `email-provider`. Usalo quando già operi un relay SMTP (Postfix, Postal, SendGrid SMTP) e non vuoi usare TurboSMTP.

## Cosa fa

- **Invia** posta in uscita tramite `nodemailer` usando STARTTLS o TLS implicito — guidato da host/port/credenziali nelle impostazioni del plugin.
- **Verifica** la connettività dalla pagina admin email con un probe "Test connection" prima di committare le credenziali.

## Come

`buildSmtpProvider(host)` legge le impostazioni (`smtpHost`, `smtpPort`, `smtpUser`, `smtpPass`, `smtpFrom`), costruisce un trasportatore `nodemailer` ed espone un metodo `send()`. SMTP non contribuisce una sorgente di suppression — i server SMTP generici non hanno un'API uniforme, quindi `plugin-email` gestisce la suppression manualmente via `/admin/email/suppression`.

## Perché

Non tutti gli operatori vogliono un provider terzo. SMTP è l'uscita universale: qualsiasi relay compatibile funziona. Rende anche possibili installazioni air-gapped — punta a un Postfix interno e spedisci posta senza toccare internet pubblico.

## Correlati

- `plugin-email` — orchestratore; questo plugin lo richiede.
- `plugin-turbosmtp` — provider first-party con bootstrap + sync di suppression.
