import type { PluginHost, PluginMeta } from '@tabularium/plugin-host-types'

export const meta: PluginMeta = {
  id: 'smtp',
  version: '0.1.0',
  provides: ['email-provider'],
}

export async function register(host: PluginHost): Promise<void> {
  // Real implementation lands in Task 5 (provider code migration).
  // Skeleton registers a no-op so the registry round-trip can be verified.
  host.registry.register('email-provider', 'smtp', {
    name: 'smtp' as const,
    async send() {
      throw new Error('plugin-smtp skeleton — implementation pending')
    },
    async verifyAuth() {
      return { ok: false as const, reason: 'plugin-smtp skeleton' }
    },
  })
}
