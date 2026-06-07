import { test, expect } from 'bun:test'
import { renderTemplate } from '@tabularium/plugin-email'

test('renderTemplate returns HTML and text for account.welcome', async () => {
  const out = await renderTemplate({
    trigger: 'account.welcome',
    locale: 'en',
    vars: { username: 'alice' },
  })
  expect(out.subject).toContain('Welcome')
  expect(out.html).toContain('alice')
  expect(out.html).toContain('<!doctype html')
  expect(out.text).toContain('alice')
  expect(out.text).not.toContain('<')
})

test('renderTemplate translates subject by locale', async () => {
  const en = await renderTemplate({
    trigger: 'plugin.approved',
    locale: 'en',
    vars: { pluginName: 'firestore' },
  })
  const de = await renderTemplate({
    trigger: 'plugin.approved',
    locale: 'de',
    vars: { pluginName: 'firestore' },
  })
  expect(en.subject).not.toEqual(de.subject)
})

test('renderTemplate escapes HTML in vars', async () => {
  const out = await renderTemplate({
    trigger: 'account.welcome',
    locale: 'en',
    vars: { username: '<script>alert(1)</script>', baseUrl: 'https://x.com' },
  })
  expect(out.html).not.toContain('<script>')
  expect(out.html).toContain('&lt;script&gt;')
})
