import type { PluginHost, PluginMeta } from '@tabularium/plugin-host-types'
import { lazyTurboProvider, buildTurboProvider } from './provider'
import { buildTurboBootstrap } from './bootstrap'
import { buildTurboSuppressionSource } from './suppression'
import { setHost } from './host-handles'
import { buildRoutes } from './routes'

export const meta: PluginMeta = {
  id: 'turbosmtp',
  version: '1.2.0',
  provides: ['email-provider', 'email-bootstrap-driver', 'email-suppression-source'],
  requires: ['email'],
  contributions: {
    'admin-nav-entry': [
      {
        id: 'email-turbosmtp',
        parent: 'email',
        href: '/admin/email/turbosmtp',
        labelKey: 'admin_nav_email_turbosmtp',
        icon: 'send',
        order: 30,
      },
    ],
    'admin-page-route': [
      {
        path: '/admin/email/turbosmtp',
        componentImport: '@tabularium/plugin-turbosmtp/frontend/admin/TurboSettings.svelte',
      },
    ],
  },
}

export async function register(host: PluginHost): Promise<void> {
  setHost(host)
  host.registry.register('email-provider', 'turbosmtp', lazyTurboProvider(host))
  host.registry.register('email-bootstrap-driver', 'turbosmtp', buildTurboBootstrap())
  host.registry.register('email-suppression-source', 'turbosmtp', buildTurboSuppressionSource(host))
  host.mountRoutes(buildRoutes())
}

export { buildTurboProvider, lazyTurboProvider, buildTurboBootstrap, buildTurboSuppressionSource }
