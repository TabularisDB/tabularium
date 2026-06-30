# plugin-email

L'orchestrateur du domaine email. Gère les templates, la livraison, l'état des destinataires et l'UI opérateur — mais **n'inclut pas** de transport. Un plugin fournisseur (p. ex. `plugin-turbosmtp` ou `plugin-smtp`) fournit le chemin d'envoi réel via le point d'extension `email-provider`.

## Ce qu'il fait

- **Rend** les emails transactionnels depuis des templates MJML (welcome, plugin approuvé/rejeté, confirmation de désinscription).
- **Envoie** via le `email-provider` actif, avec une queue passive de repli si aucun n'est configuré.
- **Enregistre** chaque envoi dans `email_log` pour diagnostic + vérifications de suppression par destinataire.
- **Applique** les préférences de désinscription: `email_preferences` par template, `email_suppression` global, headers List-Unsubscribe.
- **Expose** une page d'admin (`/admin/email`), une liste de suppression (`/admin/email/suppression`) et un centre de préférences token-authentifié (`/email/unsubscribe/[token]`).

## Comment

`sendEmail()` est la façade unique. Elle résout le fournisseur actif via le registry du kernel, exécute les gates de suppression + préférences, rend le template avec la locale du destinataire, et écrit la ligne d'audit avant/après l'appel amont. Les abonnés du bus d'événements (`account.welcome`, `plugin.approved`, `plugin.rejected`) émettent des événements ; ce plugin les écoute et les dispatche.

## Pourquoi

L'email est le câble entre Tabularium et les humains. Centraliser la livraison signifie auditer, gérer et rendre en un seul endroit ; remplacer TurboSMTP par un serveur SMTP interne est un changement de plugin fournisseur, pas un refactoring du cœur.

## Connexe

- `plugin-turbosmtp` — fournisseur principal.
- `plugin-smtp` — fallback SMTP générique.
