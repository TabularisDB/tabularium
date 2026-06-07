import { test, expect, beforeEach } from 'bun:test'
import {
  initPlugins,
  registry,
  listContributions,
  __clearLoadedForTests,
  __clearContributions,
} from '../../../src/lib/plugin-host'
import { setSetting, deleteSetting } from '../../../src/lib/settings'
import { clearDb } from '../../helpers'

beforeEach(async () => {
  await clearDb()
  __clearLoadedForTests()
  __clearContributions()
  registry.__clear()
  await deleteSetting('infra.plugins.enabled')
})

test('initPlugins boots the three first-party skeleton packages', async () => {
  await setSetting('infra.plugins.enabled', JSON.stringify(['email', 'smtp', 'turbosmtp']))
  await initPlugins()

  const providers = registry.resolveAll<{ name: string }>('email-provider')
  const names = providers.map((p) => p.name).sort()
  expect(names).toEqual(['smtp', 'turbosmtp'])

  const adminNav = listContributions()['admin-nav-entry']
  expect(adminNav.some((c) => (c as { pluginId: string }).pluginId === 'email')).toBe(true)
})
