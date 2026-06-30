# plugin-discord-notifier

A bridge from Tabularium's domain events to a Discord channel. Listens on the event bus and posts a webhook for events the operator cares about — typically `plugin.approved`, `plugin.rejected`, and `plugin.submitted` for a moderation channel.

## What it does

- **Subscribes** to events via `host.events.on('plugin.*', ...)`.
- **Posts** a formatted embed via the configured Discord webhook URL — title, plugin name, actor, timestamp, link back to the admin view.
- **Buffers + retries** on transient 5xx so a Discord outage doesn't drop notifications mid-stream.

## How

The plugin reads its webhook URL from `host.settings.get('discord.webhook')` — set it from the admin panel (or via `infra.plugins.discord.webhook`) and the subscriber picks it up at next emit. There is no per-channel customisation in v1; one webhook → one channel.

## Why

Most operators want a live signal when something needs moderator attention. Webhooks are zero-infra (no bot, no token, no rate-limit anxiety), and Discord is where most plugin communities already live. This plugin is the minimum-viable case of "Tabularium speaks to the outside world via an event sink" — copy the shape to build a Slack, Mattermost, or Telegram variant.

## Related

- Kernel docs: event bus (`host.events.on/emit`), settings surface (`host.settings`).
