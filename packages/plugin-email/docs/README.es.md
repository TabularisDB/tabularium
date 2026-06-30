# plugin-email

El orquestador para el dominio de email. Gestiona plantillas, entrega, estado de destinatarios y la UI del operador — pero **no** incluye transporte. Un plugin proveedor (p. ej. `plugin-turbosmtp` o `plugin-smtp`) provee la ruta de envío real a través del punto de extensión `email-provider`.

## Qué hace

- **Renderiza** emails transaccionales desde plantillas MJML (welcome, plugin aprobado/rechazado, confirmación de baja).
- **Envía** mediante el `email-provider` activo, con cola pasiva de respaldo cuando no hay ninguno configurado.
- **Registra** cada envío en `email_log` para diagnóstico + comprobaciones de suppression por destinatario.
- **Aplica** preferencias de baja: `email_preferences` por plantilla, `email_suppression` global, y cabeceras List-Unsubscribe.
- **Expone** página de ajustes admin (`/admin/email`), lista de suppression (`/admin/email/suppression`) y centro de preferencias autenticado por token (`/email/unsubscribe/[token]`).

## Cómo

`sendEmail()` es la única fachada. Resuelve el proveedor activo a través del registry del kernel, ejecuta los gates de suppression + preferencias, renderiza la plantilla con la locale del destinatario y escribe la fila de auditoría antes/después de la llamada upstream. Los suscriptores del bus de eventos (`account.welcome`, `plugin.approved`, `plugin.rejected`) emiten eventos; este plugin los escucha y los despacha.

## Por qué

El email es el cable entre Tabularium y los humanos. Centralizar la entrega significa auditar, gatear y renderizar en un solo lugar; cambiar TurboSMTP por un servidor SMTP propio es un cambio de plugin proveedor, no una refactorización del core.

## Relacionado

- `plugin-turbosmtp` — proveedor principal.
- `plugin-smtp` — fallback SMTP genérico.
