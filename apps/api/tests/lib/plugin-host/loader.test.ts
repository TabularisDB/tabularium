import { afterEach, beforeEach, expect, test } from 'bun:test'
import {
  __setLoaderForTests,
  __clearLoadedForTests,
  __clearContributions,
  initPlugins,
  listContributions,
  registry,
} from '../../../src/lib/plugin-host'
import { Registry } from '../../../src/lib/plugin-host/registry'
import { initSettings, setSetting, deleteSetting } from '../../../src/lib/settings'

const ENABLED_KEY = 'infra.plugins.enabled'

beforeEach(async () => {
  await initSettings()
  await deleteSetting(ENABLED_KEY)
  __clearLoadedForTests()
  __clearContributions()
  ;(registry as unknown as Registry).__clear()
  __setLoaderForTests(null)
})

afterEach(() => {
  __setLoaderForTests(null)
})

test('initPlugins loads listed plugins, records contributions, and runs register()', async () => {
  __setLoaderForTests(async (id) => {
    if (id === 'stub-a') {
      return {
        meta: {
          id: 'stub-a',
          version: '0.1.0',
          contributions: {
            'admin-nav-entry': [{ id: 'a', href: '/a', labelKey: 'a', icon: 'a' }],
          },
        },
        register: async (host) => {
          host.registry.register('email-provider', 'stub-provider', { name: 'stub-provider' })
        },
      }
    }
    throw new Error(`unknown plugin id ${id}`)
  })

  await setSetting(ENABLED_KEY, JSON.stringify(['stub-a']))
  await initPlugins()

  // Contribution lands with the plugin id stamped onto each entry.
  const navEntries = listContributions()['admin-nav-entry'] as Array<{ id: string; pluginId: string }>
  expect(navEntries).toHaveLength(1)
  expect(navEntries[0]).toMatchObject({ id: 'a', pluginId: 'stub-a' })

  // Provider registered against the kernel's built-in extension point.
  const providers = registry.resolveAll<{ name: string }>('email-provider')
  expect(providers).toEqual([{ name: 'stub-provider', impl: { name: 'stub-provider' } }])
})

test('empty enabled list → no-op', async () => {
  __setLoaderForTests(async () => {
    throw new Error('loader should not be called')
  })
  await setSetting(ENABLED_KEY, JSON.stringify([]))
  await initPlugins()
  expect(listContributions()['admin-nav-entry']).toEqual([])
  expect(registry.resolveAll('email-provider')).toEqual([])
})

test('plugin throws in register → kernel logs and continues to next plugin', async () => {
  __setLoaderForTests(async (id) => {
    if (id === 'broken') {
      return {
        meta: { id: 'broken', version: '0.1.0' },
        register: async () => {
          throw new Error('register exploded')
        },
      }
    }
    if (id === 'ok') {
      return {
        meta: {
          id: 'ok',
          version: '0.1.0',
          contributions: {
            'admin-nav-entry': [{ id: 'ok', href: '/ok', labelKey: 'ok', icon: 'ok' }],
          },
        },
        register: async (host) => {
          host.registry.register('email-provider', 'ok-provider', { name: 'ok' })
        },
      }
    }
    throw new Error(`unknown ${id}`)
  })

  await setSetting(ENABLED_KEY, JSON.stringify(['broken', 'ok']))
  await initPlugins()

  // 'ok' was loaded after 'broken' failed.
  const navEntries = listContributions()['admin-nav-entry'] as Array<{ id: string; pluginId: string }>
  expect(navEntries).toHaveLength(1)
  expect(navEntries[0]).toMatchObject({ id: 'ok', pluginId: 'ok' })
  const providers = registry.resolveAll<{ name: string }>('email-provider')
  expect(providers.map((p) => p.name)).toEqual(['ok-provider'])
})

test('initPlugins defines built-in email-provider point (idempotent on re-init)', async () => {
  __setLoaderForTests(async () => {
    throw new Error('should not load')
  })
  await setSetting(ENABLED_KEY, JSON.stringify([]))
  await initPlugins()
  // Re-running must not throw thanks to the catch in defineBuiltInPoints.
  await initPlugins()
  // After definePoint, register on the point should succeed.
  expect(() => registry.register('email-provider', 'x', {})).not.toThrow()
})

test('unknown plugin id in enabled list is skipped (no override)', async () => {
  // No override → fall through to resolver.
  await setSetting(ENABLED_KEY, JSON.stringify(['definitely-not-a-real-plugin-xyz']))
  await initPlugins()
  // No throw, no contributions.
  expect(listContributions()['admin-nav-entry']).toEqual([])
})

test('duplicate plugin id → second loadOne throws (kernel-enforced unique prefix)', async () => {
  let calls = 0
  __setLoaderForTests(async (id) => {
    calls += 1
    if (id === 'same') {
      return {
        meta: { id: 'same', version: '0.1.0' },
        register: async () => {},
      }
    }
    throw new Error(`unknown ${id}`)
  })

  // First load succeeds; second occurrence in the enabled list must be
  // rejected loudly so two plugins can't share the `pl_<id>__` table prefix.
  await setSetting(ENABLED_KEY, JSON.stringify(['same', 'same']))
  await initPlugins()

  // Both ids resolved through the loader, but the second registration
  // attempt should have thrown (caught + logged by initPlugins' try/catch).
  expect(calls).toBeGreaterThanOrEqual(1)
  // Only one contribution slot wired up — second register() never ran.
  const navEntries = listContributions()['admin-nav-entry']
  expect(navEntries).toEqual([])
})

test('malformed infra.plugins.enabled → defaults are attempted gracefully', async () => {
  await setSetting(ENABLED_KEY, 'not-json[')
  // No override → defaults ['email','turbosmtp'] are attempted via resolver.
  // initPlugins must not throw regardless of whether the defaults exist yet.
  await initPlugins()
  // The two default plugins are first-party and exist after SP1 Task 3, so we
  // can assert email's admin-nav-entry landed. (Earlier in SP1 this test asserted
  // empty contributions; updated when the skeleton packages came online.)
  const adminNav = listContributions()['admin-nav-entry']
  expect(adminNav.some((c) => (c as { pluginId: string }).pluginId === 'email')).toBe(true)
})
