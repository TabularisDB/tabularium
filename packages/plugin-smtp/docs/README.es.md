# plugin-smtp

Transporte SMTP genérico para el dominio email de Tabularium. Se registra en el punto de extensión `email-provider`. Úsalo cuando ya operas un relay SMTP (Postfix, Postal, SendGrid SMTP) y no quieres usar TurboSMTP.

## Qué hace

- **Envía** correo saliente vía `nodemailer` usando STARTTLS o TLS implícito — controlado por host/port/credenciales en los ajustes del plugin.
- **Verifica** conectividad desde la página admin de email con una sonda "Test connection" antes de guardar credenciales.

## Cómo

`buildSmtpProvider(host)` lee los ajustes (`smtpHost`, `smtpPort`, `smtpUser`, `smtpPass`, `smtpFrom`), construye un transportador `nodemailer` y expone un método `send()`. SMTP no aporta una fuente de suppression — los servidores SMTP genéricos no tienen una API uniforme, así que `plugin-email` gestiona suppression manualmente vía `/admin/email/suppression`.

## Por qué

No todos los operadores quieren un proveedor externo. SMTP es la salida universal: cualquier relay compatible funciona. También hace posibles instalaciones air-gapped — apunta a un Postfix interno y envía correo sin tocar internet pública.

## Relacionado

- `plugin-email` — orquestador; este plugin lo requiere.
- `plugin-turbosmtp` — proveedor first-party con bootstrap + sync de suppression.
