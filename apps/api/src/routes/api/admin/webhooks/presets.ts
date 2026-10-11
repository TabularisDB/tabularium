import { Elysia } from 'elysia'
import { adminMiddleware } from '$middleware/admin'
import { WEBHOOK_EVENTS } from '$lib/webhooks/events'
import { WEBHOOK_PRESETS } from '$lib/webhooks/presets'

// Placeholder catalog for the editor. Optional groups are absent (render
// empty) on events they don't apply to.
const PLACEHOLDERS = [
  { path: 'event.type', description: 'Event type, e.g. plugin.approved' },
  { path: 'event.title', description: 'Human title, e.g. "Plugin approved: Foo"' },
  { path: 'event.url', description: 'Most relevant link (plugin page, admin queue, requests)' },
  { path: 'event.color', description: 'Suggested color as an integer (Discord embeds)' },
  { path: 'event.occurredAt', description: 'Epoch ms; use `| date` for ISO 8601' },
  { path: 'event.reason', description: 'Rejection / yank reason, when given' },
  { path: 'event.actor.name', description: 'Who triggered the event' },
  { path: 'registry.name', description: 'Instance name from branding' },
  { path: 'registry.url', description: 'Public registry URL' },
  { path: 'subject.name', description: 'Plugin or request name (always set)' },
  { path: 'subject.description', description: 'Plugin or request description' },
  { path: 'subject.url', description: 'Plugin or request page' },
  { path: 'plugin.id', description: 'Plugin slug' },
  { path: 'plugin.name', description: 'Plugin name' },
  { path: 'plugin.status', description: 'approved | pending | rejected' },
  { path: 'plugin.repoUrl', description: 'Source repository' },
  { path: 'plugin.latestVersion', description: 'Latest published version' },
  { path: 'plugin.supportEmail', description: 'Support email from the manifest' },
  { path: 'owner.username', description: 'Owner forge username' },
  { path: 'owner.displayName', description: 'Owner display name' },
  { path: 'release.version', description: 'Release version (release.* events)' },
  { path: 'transfer.from.username', description: 'Current owner (transfer.* events)' },
  { path: 'transfer.to.username', description: 'Recipient (transfer.* events)' },
  { path: 'transfer.message', description: 'Note attached to the transfer' },
  { path: 'request.name', description: 'Requested plugin name (request.created)' },
  { path: 'secrets.NAME', description: 'A secret stored on this webhook' },
]

const FILTERS = [
  { name: 'raw', description: 'Insert verbatim, no escaping (e.g. a secret URL)' },
  { name: 'json', description: 'JSON.stringify the value, quotes included' },
  { name: 'html', description: 'Escape for HTML (email bodies)' },
  { name: 'url', description: 'Percent-encode' },
  { name: 'default:"x"', description: 'Fallback when empty' },
  { name: 'truncate:N', description: 'Cut to N characters' },
  { name: 'upper', description: 'Uppercase' },
  { name: 'lower', description: 'Lowercase' },
  { name: 'date', description: 'Epoch ms → ISO 8601' },
]

export default new Elysia()
  .use(adminMiddleware)
  .get(
    '/',
    () => ({ events: WEBHOOK_EVENTS, presets: WEBHOOK_PRESETS, placeholders: PLACEHOLDERS, filters: FILTERS }),
    {
      detail: {
        tags: ['Admin'],
        summary: 'Webhook events, presets and template reference',
        operationId: 'adminWebhookPresets',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      },
    },
  )
