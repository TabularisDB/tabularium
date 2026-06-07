import type { PluginHost, PluginMeta } from '@tabularium/plugin-host-types'

export const meta: PluginMeta = {
  id: 'email',
  version: '0.1.0',
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
  // Subscriptions + provider activation land in Task 7.
  // For Task 3 the skeleton just announces itself.
  host.logger.info('plugin-email skeleton registered')
}
