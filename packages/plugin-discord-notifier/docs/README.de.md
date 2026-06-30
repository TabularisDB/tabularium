# plugin-discord-notifier

Eine Brücke von Tabularium's Domain-Events zu einem Discord-Channel. Hört auf den Event-Bus und postet einen Webhook für Events, die der Operator wichtig findet — typischerweise `plugin.approved`, `plugin.rejected` und `plugin.submitted` für einen Moderation-Channel.

## Was es macht

- **Subscribed** auf Events via `host.events.on('plugin.*', ...)`.
- **Postet** ein formatiertes Embed via den konfigurierten Discord-Webhook — Titel, Plugin-Name, Actor, Timestamp, Link zurück zur Admin-View.
- **Buffert + retried** bei transienten 5xx, damit ein Discord-Outage nicht mitten im Stream Notifications verliert.

## Wie

Das Plugin liest seine Webhook-URL aus `host.settings.get('discord.webhook')` — setze sie aus dem Admin-Panel (oder via `infra.plugins.discord.webhook`) und der Subscriber pickt sie beim nächsten Emit auf. Keine Per-Channel-Customization in v1; ein Webhook → ein Channel.

## Warum

Die meisten Operators wollen ein Live-Signal wenn etwas Moderator-Aufmerksamkeit braucht. Webhooks sind zero-infra (kein Bot, kein Token, keine Rate-Limit-Sorgen), und Discord ist da, wo die meisten Plugin-Communities eh schon leben. Dieses Plugin ist der minimum-viable Fall von "Tabularium spricht via Event-Sink zur Außenwelt" — kopiere die Form um eine Slack-, Mattermost- oder Telegram-Variante zu bauen.

## Verwandt

- Kernel-Docs: Event-Bus (`host.events.on/emit`), Settings-Surface (`host.settings`).
