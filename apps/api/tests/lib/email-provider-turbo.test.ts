import { test, expect, beforeEach } from 'bun:test'
import { clearDb } from '../helpers'
import { setSetting } from '../../src/lib/settings'
import { buildHost } from '../../src/lib/plugin-host'
import { buildTurboProvider } from '@tabularium/plugin-turbosmtp'

const host = buildHost('test-turbo-provider')

beforeEach(clearDb)

test('buildTurboProvider returns null when settings missing', async () => {
  const provider = await buildTurboProvider(host)
  expect(provider).toBeNull()
})

test('buildTurboProvider returns a provider when keys configured', async () => {
  await setSetting('email.turbo.api_key', 'a'.repeat(40), { encrypted: true })
  await setSetting('email.turbo.consumer_key', 'ck-test')
  await setSetting('email.turbo.consumer_secret', 'cs-test', { encrypted: true })
  await setSetting('email.turbo.region', 'global')
  const provider = await buildTurboProvider(host)
  expect(provider?.name).toBe('turbo')
})
