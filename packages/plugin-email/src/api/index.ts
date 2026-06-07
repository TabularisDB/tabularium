import type { PluginHost, PluginMeta } from '@tabularium/plugin-host-types'
import { setHost } from './host-handles'
import { buildRoutes } from './routes'
import { startSuppressionSync } from './suppression-sync'
import { fireWelcomeEmail } from './welcome'
import { sendEmail } from './facade'
import { resolveUserContact } from './contact'

export const meta: PluginMeta = {
  id: 'email',
  version: '1.0.0',
  provides: [],
  contributions: {
    'admin-nav-entry': [
      {
        id: 'email',
        href: '/admin/email',
        labelKey: 'admin_nav_email',
        icon: 'mail',
        order: 75,
      },
    ],
    'admin-page-route': [
      {
        path: '/admin/email',
        componentImport: '@tabularium/plugin-email/frontend/admin/EmailSettings.svelte',
      },
      {
        path: '/admin/email/suppression',
        componentImport: '@tabularium/plugin-email/frontend/admin/Suppression.svelte',
      },
    ],
    'user-settings-nav-entry': [
      {
        id: 'email',
        href: '/settings/email',
        labelKey: 'settings_nav_email',
        icon: 'mail',
        order: 20,
      },
    ],
    'user-page-route': [
      {
        path: '/settings/email',
        componentImport: '@tabularium/plugin-email/frontend/user/EmailSettings.svelte',
      },
    ],
    'public-page-route': [
      {
        path: '/email/unsubscribe/[token]',
        componentImport: '@tabularium/plugin-email/frontend/public/Unsubscribe.svelte',
      },
    ],
  },
}

export async function register(host: PluginHost): Promise<void> {
  setHost(host)
  host.mountRoutes(buildRoutes())

  // Mirror the configured provider into the registry's "active" slot so
  // facade.resolveProvider() picks it up. Skipped silently if the requested
  // provider plugin isn't loaded yet — the admin PUT route runs the same
  // sync when settings are later edited.
  const providerName = host.settings.get('email.provider')
  if (providerName === 'turbo' || providerName === 'smtp') {
    const want = providerName === 'turbo' ? 'turbosmtp' : 'smtp'
    try {
      host.registry.setActive('email-provider', want)
    } catch {
      // provider plugin not loaded — fall through
    }
  }

  // Subscribe to domain events. The kernel's bus runs handlers via
  // queueMicrotask, so these emit-sites stay fire-and-forget.
  host.events.on('account.welcome', async ({ user, username }) => {
    await fireWelcomeEmail({ userId: user.id, username })
  })

  host.events.on('plugin.approved', async ({ pluginId, pluginName, ownerId }) => {
    const contact = await resolveUserContact(ownerId)
    if (!contact) return
    await sendEmail({
      trigger: 'plugin.approved',
      user: contact,
      vars: { pluginName, pluginSlug: pluginId, baseUrl: host.env.BASE_URL },
    })
  })

  host.events.on('plugin.rejected', async ({ pluginId, pluginName, ownerId, reason }) => {
    const contact = await resolveUserContact(ownerId)
    if (!contact) return
    await sendEmail({
      trigger: 'plugin.rejected',
      user: contact,
      vars: { pluginName, pluginSlug: pluginId, reason, baseUrl: host.env.BASE_URL },
    })
  })

  // Suppression sync is a no-op when provider != turbo. Safe to call at
  // register-time; the cron itself only fires when configured.
  startSuppressionSync()
}

// Re-exports so apps/api and tests can import the email API as one surface.
export { sendEmail, __setProviderForTests, resolveProvider } from './facade'
export { resolveUserContact } from './contact'
export { fireWelcomeEmail } from './welcome'
export {
  mintUnsubscribeToken,
  verifyUnsubscribeToken,
  rotateTokenNonce,
  initPreferences,
  __resetSecretCacheForTests,
} from './unsubscribe-token'
export { loadPreferences, savePreferences, unsubscribeAllOptIn } from './preferences'
export {
  syncOnce,
  __setSyncDriverForTests,
  startSuppressionSync,
  stopSuppressionSync,
  restartSuppressionSync,
} from './suppression-sync'
export type { SuppressionDriver, SuppressionRow } from './suppression-sync'
export { __setUpstreamDriverForTests, getUpstreamDriver } from './suppression-driver'
export { __setBootstrapClientForTests } from './routes/admin/bootstrap'
export type { BootstrapDriver } from './routes/admin/bootstrap'
export { buildOptInHeaders, getMailtoDomain } from './list-unsubscribe'
export { renderTemplate } from './render'
export type {
  EmailProvider,
  EmailMessage,
  EmailTrigger,
  EmailCategory,
  EmailBucket,
  EmailPreferences,
  SendEmailInput,
  SendOutcome,
  SendResult,
  VerifyResult,
} from './types'
export {
  TRIGGER_TO_CATEGORY,
  OPT_IN_CATEGORIES,
  TRANSACTIONAL_CATEGORIES,
  DEFAULT_PREFERENCES,
} from './types'
