import { test, expect } from 'bun:test'
import { TurboSmtp } from 'turbosmtp'
import { handleWebhookRequest } from 'turbosmtp/webhooks'

test('turbosmtp top-level export is reachable', () => {
  expect(typeof TurboSmtp).toBe('function')
})

test('turbosmtp/webhooks subpath export is reachable', () => {
  expect(typeof handleWebhookRequest).toBe('function')
})

import mjml2html from 'mjml'
import nodemailer from 'nodemailer'
import { Cron } from 'croner'
import { convert } from 'html-to-text'

test('mjml compiles a minimal document', async () => {
  const out = await mjml2html('<mjml><mj-body><mj-section><mj-column><mj-text>Hi</mj-text></mj-column></mj-section></mj-body></mjml>')
  expect(out.html).toContain('Hi')
  expect(out.errors).toHaveLength(0)
})

test('nodemailer createTransport is callable', () => {
  const t = nodemailer.createTransport({ host: 'localhost', port: 2525, secure: false })
  expect(typeof t.sendMail).toBe('function')
})

test('croner Cron accepts an expression', () => {
  const c = new Cron('* * * * *', { paused: true })
  expect(c.nextRun()).toBeInstanceOf(Date)
})

test('html-to-text converts a paragraph', () => {
  expect(convert('<p>hi</p>')).toBe('hi')
})
