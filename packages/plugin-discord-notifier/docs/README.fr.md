# plugin-discord-notifier

Un pont entre les événements de domaine Tabularium et un canal Discord. Écoute le bus d'événements et publie un webhook pour les événements importants pour l'opérateur — typiquement `plugin.approved`, `plugin.rejected` et `plugin.submitted` pour un canal de modération.

## Ce qu'il fait

- **S'abonne** aux événements via `host.events.on('plugin.*', ...)`.
- **Publie** un embed formaté via le webhook Discord configuré — titre, nom du plugin, acteur, timestamp, lien vers la vue admin.
- **Bufferise + rejoue** sur 5xx transitoires pour qu'une panne Discord ne perde pas de notifications.

## Comment

Le plugin lit son URL webhook depuis `host.settings.get('discord.webhook')` — configurez-la depuis le panneau admin (ou via `infra.plugins.discord.webhook`) et l'abonné la récupère au prochain emit. Pas de personnalisation par canal en v1 ; un webhook → un canal.

## Pourquoi

La plupart des opérateurs veulent un signal live quand quelque chose nécessite l'attention d'un modérateur. Les webhooks sont zéro-infra (pas de bot, pas de token, pas d'angoisse de rate-limit), et Discord est l'endroit où la plupart des communautés de plugins vivent déjà. Ce plugin est le cas minimum viable de "Tabularium parle au monde extérieur via un sink d'événements" — copiez la forme pour construire une variante Slack, Mattermost ou Telegram.

## Connexe

- Docs du kernel : bus d'événements (`host.events.on/emit`), surface settings (`host.settings`).
