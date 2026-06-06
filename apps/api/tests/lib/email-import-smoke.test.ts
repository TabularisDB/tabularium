import { test, expect } from 'bun:test'
import { TurboSmtp } from 'turbosmtp'
import { handleWebhookRequest } from 'turbosmtp/webhooks'

test('turbosmtp top-level export is reachable', () => {
  expect(typeof TurboSmtp).toBe('function')
})

test('turbosmtp/webhooks subpath export is reachable', () => {
  expect(typeof handleWebhookRequest).toBe('function')
})
