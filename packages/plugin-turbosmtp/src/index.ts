import type { PluginHost, PluginMeta } from '@tabularium/plugin-host-types'
import { lazyTurboProvider, buildTurboProvider } from './provider'

export const meta: PluginMeta = {
  id: 'turbosmtp',
  version: '1.0.0',
  provides: ['email-provider'],
}

export async function register(host: PluginHost): Promise<void> {
  host.registry.register('email-provider', 'turbosmtp', lazyTurboProvider(host))
}

export { buildTurboProvider, lazyTurboProvider }
