# plugin-turbosmtp

Transport TurboSMTP pour le domaine email de Tabularium. S'enregistre aux points d'extension `email-provider`, `email-bootstrap-driver` et `email-suppression-source`.

## Ce qu'il fait

- **Envoie** les emails sortants via authentification `consumer_key` contre l'API REST TurboSMTP.
- **Bootstrap** des nouvelles instances depuis les identifiants de compte TurboSMTP de l'opérateur.
- **Synchronise** la liste de suppression amont vers `email_suppression` via croner.
- **Expose** un panneau admin à `/admin/email/turbosmtp` avec sparkline de livraison 24h, engagement, liste de suppression, identifiants masqués et un wizard d'onboarding en 3 étapes.

## Comment

`buildTurboProvider(host)` lit les identifiants depuis `host.settings` et construit un client `TurboSmtp`. Le provider n'a pas d'état propre — `plugin-email` possède le log, la BD de suppression et les templates.

## Pourquoi

TurboSMTP est le défaut de dev : bootstrap OAuth-like documenté, API de suppression compatible, niveau gratuit suffisant pour une démo d'instance.

## Désactivation sûre

Désactivez dans l'ordre des dépendances : ce plugin d'abord, puis `plugin-email`.

## Connexe

- `plugin-email` — orchestrateur ; ce plugin le requiert.
- `plugin-smtp` — alternative SMTP générique.
