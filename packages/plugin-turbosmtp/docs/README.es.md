# plugin-turbosmtp

Transporte TurboSMTP para el dominio email de Tabularium. Se registra en los puntos de extensión `email-provider`, `email-bootstrap-driver` y `email-suppression-source`.

## Qué hace

- **Envía** correo saliente mediante autenticación `consumer_key` contra la API REST de TurboSMTP.
- **Bootstrap** de nuevas instancias desde las credenciales de cuenta TurboSMTP del operador.
- **Sincroniza** la lista de suppression upstream a `email_suppression` mediante croner.
- **Expone** un panel admin en `/admin/email/turbosmtp` con sparkline de entrega 24h, engagement, lista de suppression, credenciales enmascaradas y un wizard de onboarding de 3 pasos.

## Cómo

`buildTurboProvider(host)` lee las credenciales de `host.settings` y construye un cliente `TurboSmtp`. El provider no tiene estado propio — `plugin-email` posee el log, la DB de suppression y los templates.

## Por qué

TurboSMTP es el predeterminado de desarrollo: bootstrap documentado tipo OAuth, API de suppression compatible y nivel gratuito suficiente para una demo de instancia.

## Desactivación segura

Desactiva en orden de dependencia: este plugin primero, luego `plugin-email`.

## Relacionado

- `plugin-email` — orquestador; este plugin lo requiere.
- `plugin-smtp` — alternativa SMTP genérica.
