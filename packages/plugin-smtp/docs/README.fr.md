# plugin-smtp

Transport SMTP générique pour le domaine email de Tabularium. S'enregistre au point d'extension `email-provider`. À utiliser quand vous opérez déjà un relais SMTP (Postfix, Postal, SendGrid SMTP) et ne voulez pas de TurboSMTP.

## Ce qu'il fait

- **Envoie** les emails sortants via `nodemailer` en utilisant STARTTLS ou TLS implicite — piloté par host/port/identifiants dans les réglages du plugin.
- **Vérifie** la connectivité depuis la page email admin avec une sonde "Test connection" avant de commit des identifiants.

## Comment

`buildSmtpProvider(host)` lit les réglages (`smtpHost`, `smtpPort`, `smtpUser`, `smtpPass`, `smtpFrom`), construit un transporteur `nodemailer` et expose une méthode `send()`. SMTP n'apporte pas de source de suppression — les serveurs SMTP génériques n'ont pas d'API uniforme, donc `plugin-email` gère la suppression manuellement via `/admin/email/suppression`.

## Pourquoi

Tous les opérateurs ne veulent pas d'un fournisseur tiers. SMTP est la sortie universelle : tout relais conforme fonctionne. Permet aussi des installations air-gapped — pointez vers un Postfix interne et expédiez du courrier sans toucher à l'internet public.

## Connexe

- `plugin-email` — orchestrateur ; ce plugin le requiert.
- `plugin-turbosmtp` — fournisseur first-party avec bootstrap + sync de suppression.
