import { test, expect } from 'bun:test'
import { renderTemplate } from '../../src/lib/email/render'

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
