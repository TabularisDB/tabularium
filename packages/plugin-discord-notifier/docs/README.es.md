# plugin-discord-notifier

Un puente desde los eventos de dominio de Tabularium a un canal de Discord. Escucha el bus de eventos y publica un webhook para los eventos que el operador considere relevantes — típicamente `plugin.approved`, `plugin.rejected` y `plugin.submitted` para un canal de moderación.

## Qué hace

- **Suscribe** a eventos vía `host.events.on('plugin.*', ...)`.
- **Publica** un embed formateado mediante el webhook de Discord configurado — título, nombre del plugin, actor, timestamp, enlace de regreso a la vista admin.
- **Bufferea + reintenta** ante 5xx transitorios para que una caída de Discord no descarte notificaciones.

## Cómo

El plugin lee su URL de webhook desde `host.settings.get('discord.webhook')` — configúrala desde el panel admin (o vía `infra.plugins.discord.webhook`) y el suscriptor la recogerá en el próximo emit. Sin personalización por canal en v1; un webhook → un canal.

## Por qué

La mayoría de los operadores quieren una señal en vivo cuando algo necesita atención de moderador. Los webhooks son zero-infra (sin bot, sin token, sin ansiedad de rate-limit) y Discord es donde la mayoría de las comunidades de plugins ya viven. Este plugin es el caso mínimo viable de "Tabularium habla al mundo exterior vía sink de eventos" — copia la forma para construir una variante de Slack, Mattermost o Telegram.

## Relacionado

- Documentos del kernel: bus de eventos (`host.events.on/emit`), superficie de settings (`host.settings`).
