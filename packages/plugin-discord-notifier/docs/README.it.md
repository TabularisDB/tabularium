# plugin-discord-notifier

Un ponte tra gli eventi di dominio di Tabularium e un canale Discord. Ascolta il bus eventi e pubblica un webhook per gli eventi che interessano all'operatore — tipicamente `plugin.approved`, `plugin.rejected` e `plugin.submitted` per un canale di moderazione.

## Cosa fa

- **Si iscrive** agli eventi tramite `host.events.on('plugin.*', ...)`.
- **Pubblica** un embed formattato tramite il webhook Discord configurato — titolo, nome del plugin, attore, timestamp, link di ritorno alla vista admin.
- **Buffera + ritenta** su 5xx transienti perché un outage di Discord non perda notifiche.

## Come

Il plugin legge l'URL webhook da `host.settings.get('discord.webhook')` — impostalo dal pannello admin (o via `infra.plugins.discord.webhook`) e il subscriber lo raccoglie al prossimo emit. Nessuna personalizzazione per canale in v1; un webhook → un canale.

## Perché

La maggior parte degli operatori vuole un segnale live quando qualcosa richiede attenzione moderatore. I webhook sono zero-infra (niente bot, niente token, niente ansia di rate-limit), e Discord è dove la maggior parte delle community di plugin già vivono. Questo plugin è il caso minimum viable di "Tabularium parla al mondo esterno via sink di eventi" — copia la forma per costruire una variante Slack, Mattermost o Telegram.

## Correlati

- Docs del kernel: bus eventi (`host.events.on/emit`), superficie settings (`host.settings`).
