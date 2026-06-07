import type { PluginHost, PluginMeta } from '@tabularium/plugin-host-types'
import { buildSmtpProvider, lazySmtpProvider } from './provider'

export const meta: PluginMeta = {
  id: 'smtp',
  version: '1.0.0',
  provides: ['email-provider'],
}

export async function register(host: PluginHost): Promise<void> {
  host.registry.register('email-provider', 'smtp', lazySmtpProvider(host))
}

export { buildSmtpProvider, lazySmtpProvider }
