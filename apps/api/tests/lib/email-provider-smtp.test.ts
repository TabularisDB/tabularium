import { test, expect, beforeEach } from 'bun:test'
import { clearDb } from '../helpers'
import { setSetting } from '../../src/lib/settings'
import { buildHost } from '../../src/lib/plugin-host'
import { buildSmtpProvider } from '@tabularium/plugin-smtp'

const host = buildHost('test-smtp-provider')

beforeEach(clearDb)

test('buildSmtpProvider returns null when settings missing', async () => {
  const provider = await buildSmtpProvider(host)
  expect(provider).toBeNull()
})

test('buildSmtpProvider returns provider when host + port configured', async () => {
  await setSetting('email.smtp.host', 'localhost')
  await setSetting('email.smtp.port', '2525')
  await setSetting('email.smtp.user', 'u')
  await setSetting('email.smtp.pass', 'p', { encrypted: true })
  await setSetting('email.smtp.tls', 'false')
  const provider = await buildSmtpProvider(host)
  expect(provider?.name).toBe('smtp')
})
