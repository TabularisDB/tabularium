import { test, expect, beforeEach } from 'bun:test'
import { clearDb } from '../helpers'
import { setSetting } from '../../src/lib/settings'
import { buildSmtpProvider } from '../../src/lib/email/providers/smtp'

beforeEach(clearDb)

test('buildSmtpProvider returns null when settings missing', async () => {
  const provider = await buildSmtpProvider()
  expect(provider).toBeNull()
})

test('buildSmtpProvider returns provider when host + port configured', async () => {
  await setSetting('email.smtp.host', 'localhost')
  await setSetting('email.smtp.port', '2525')
  await setSetting('email.smtp.user', 'u')
  await setSetting('email.smtp.pass', 'p', { encrypted: true })
  await setSetting('email.smtp.tls', 'false')
  const provider = await buildSmtpProvider()
  expect(provider?.name).toBe('smtp')
})
