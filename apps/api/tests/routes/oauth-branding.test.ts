import { beforeEach, expect, test } from 'bun:test'
import { clearDb, buildApp } from '../helpers'
import { setSetting } from '../../src/lib/settings'
import { updateInstance, createInstance } from '../../src/lib/provider-instance'

beforeEach(clearDb)
test('OAuth uses the instance name, colors, logo, favicon and footer', async () => {
  await setSetting('branding.name', 'Acme Registry')
  await setSetting('branding.primary_hex', '#35d0c0')
  await setSetting('branding.accent_hex', '#8b7cf6')
  await setSetting('branding.success_hex', '#22c55e')
  await setSetting('branding.logo_url', 'https://brand.example.test/logo.svg')
  await setSetting('branding.favicon_url', '/uploads/favicon.svg')
  await setSetting('branding.footer_text', 'An Acme service')
  const response = await (await buildApp()).handle(new Request('http://localhost/oauth/connections'))
  const html = await response.text()
  expect(html).toContain('· Acme Registry</title>')
  expect(html).toContain('--brand-primary:#35d0c0')
  expect(html).toContain('--brand-accent:#8b7cf6')
  expect(html).toContain('--brand-success:#22c55e')
  expect(html).toContain('src="https://brand.example.test/logo.svg"')
  expect(html).toContain('href="/uploads/favicon.svg"')
  expect(html).toContain('An Acme service')
  expect(response.headers.get('content-security-policy')).toContain('https://brand.example.test')
  expect(html).toContain('mode-watcher-mode')
})
test('provider icons follow settings and use the existing frontend icon convention', async () => {
  await updateInstance('github', { logoUrl: 'https://brand.example.test/github.svg' })
  await createInstance({
    id: 'codeberg',
    kind: 'gitea',
    displayName: 'Codeberg',
    baseUrl: 'https://codeberg.org',
    clientId: 'test',
    clientSecret: 'test',
  })
  const html = await (await (await buildApp()).handle(new Request('http://localhost/oauth/connections'))).text()
  expect(html).toContain('src="https://brand.example.test/github.svg"')
  expect(html).toContain('src="https://cdn.simpleicons.org/codeberg"')
  expect(html).toContain('Continue with Codeberg')
  expect(html).not.toContain('Administrator recovery login')
})
test('branding cannot inject HTML, CSS, scripts or unsafe image URLs into OAuth', async () => {
  await setSetting('branding.name', '<script>bad()</script>')
  await setSetting('branding.primary_hex', '#fff;}</style><script>bad()</script>')
  await setSetting('branding.logo_url', 'javascript:alert(1)')
  await setSetting('branding.favicon_url', 'data:image/svg+xml,evil')
  await setSetting('branding.analytics_script', '<script>analytics()</script>')
  await updateInstance('github', { logoUrl: 'javascript:alert(1)' })
  const html = await (await (await buildApp()).handle(new Request('http://localhost/oauth/connections'))).text()
  expect(html).toContain('&lt;script&gt;bad()&lt;/script&gt;')
  expect(html).toContain('--brand-primary:#3b82f6')
  expect(html).not.toContain('<script>bad()')
  expect(html).not.toContain('javascript:')
  expect(html).not.toContain('data:image')
  expect(html).not.toContain('analytics()')
})
