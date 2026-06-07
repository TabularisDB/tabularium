import type { PluginHost, PluginMeta } from '@tabularium/plugin-host-types'
import { lazyTurboProvider, buildTurboProvider } from './provider'
import { buildTurboBootstrap } from './bootstrap'
import { buildTurboSuppressionSource } from './suppression'

export const meta: PluginMeta = {
  id: 'turbosmtp',
  version: '1.0.0',
  provides: ['email-provider', 'email-bootstrap-driver', 'email-suppression-source'],
}

export async function register(host: PluginHost): Promise<void> {
  host.registry.register('email-provider', 'turbosmtp', lazyTurboProvider(host))
  host.registry.register('email-bootstrap-driver', 'turbosmtp', buildTurboBootstrap())
  host.registry.register('email-suppression-source', 'turbosmtp', buildTurboSuppressionSource(host))
}

export { buildTurboProvider, lazyTurboProvider, buildTurboBootstrap, buildTurboSuppressionSource }
