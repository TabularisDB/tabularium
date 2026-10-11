import { describe, it, expect, beforeAll } from 'bun:test'
import { clearDb } from '../helpers'
import {
  DeliveryConfigError,
  isPrivateAddress,
  maskRequest,
  renderRequest,
  signBody,
} from '../../src/lib/webhooks/delivery'
import { sampleContext, WEBHOOK_EVENTS } from '../../src/lib/webhooks/events'
import { WEBHOOK_PRESETS } from '../../src/lib/webhooks/presets'

beforeAll(clearDb)

const extra = { deliveryId: 'd1', event: 'plugin.approved', signingSecret: null }

describe('webhook delivery helpers', () => {
  it('classifies private addresses', () => {
    for (const ip of [
      '127.0.0.1',
      '10.1.2.3',
      '172.20.0.1',
      '192.168.1.1',
      '169.254.169.254',
      '::1',
      'fd00::1',
      'fe80::1',
      '::ffff:127.0.0.1',
      '0.0.0.0',
      '100.64.0.1',
    ]) {
      expect(isPrivateAddress(ip)).toBe(true)
    }
    for (const ip of ['1.1.1.1', '8.8.8.8', '172.32.0.1', '2606:4700::1111']) {
      expect(isPrivateAddress(ip)).toBe(false)
    }
  })

  it('every preset renders a valid request for every event', () => {
    for (const preset of WEBHOOK_PRESETS) {
      const secrets = Object.fromEntries(preset.secrets.map((s) => [s, 'https://example.com/secret-value']))
      for (const event of WEBHOOK_EVENTS) {
        const req = renderRequest(
          { ...preset, headers: JSON.stringify(preset.headers) },
          sampleContext(event) as unknown as Record<string, unknown>,
          secrets,
          { ...extra, event },
        )
        expect(req.body).not.toBeNull()
        expect(() => JSON.parse(req.body!)).not.toThrow()
      }
    }
  })

  it('discord preset produces an embed with the reason on rejections', () => {
    const discord = WEBHOOK_PRESETS.find((p) => p.key === 'discord')!
    const req = renderRequest(
      { ...discord, headers: '[]' },
      sampleContext('plugin.rejected') as unknown as Record<string, unknown>,
      { DISCORD_WEBHOOK_URL: 'https://discord.com/api/webhooks/1/tok' },
      extra,
    )
    expect(req.url).toBe('https://discord.com/api/webhooks/1/tok')
    const embed = JSON.parse(req.body!).embeds[0]
    expect(embed.title).toBe('Plugin rejected: Example Plugin')
    expect(embed.color).toBe(0xef4444)
    expect(embed.description).toContain('**Reason:** Example reason')
  })

  it('fails with a config error when the body is not valid JSON', () => {
    expect(() =>
      renderRequest(
        {
          method: 'POST',
          url: 'https://x.test',
          headers: '[]',
          body: '{"a": {{plugin.name}}}',
          contentType: 'application/json',
        },
        sampleContext('plugin.approved') as unknown as Record<string, unknown>,
        {},
        extra,
      ),
    ).toThrow(DeliveryConfigError)
  })

  it('signs the body and lets template headers override defaults', () => {
    const req = renderRequest(
      {
        method: 'POST',
        url: 'https://x.test',
        headers: JSON.stringify([{ name: 'content-type', value: 'application/vnd.custom+json' }]),
        body: '{}',
        contentType: 'application/json',
      },
      {},
      {},
      { ...extra, signingSecret: 'shh' },
    )
    expect(req.headers['Content-Type']).toBeUndefined()
    expect(req.headers['content-type']).toBe('application/vnd.custom+json')
    const ts = req.headers['X-Tabularium-Timestamp']
    expect(req.headers['X-Tabularium-Signature']).toBe(signBody('shh', ts, '{}'))
  })

  it('masks secret values', () => {
    const masked = maskRequest(
      {
        method: 'POST',
        url: 'https://x.test/topsecret',
        headers: { k: 'topsecret' },
        body: '"topsecret"',
        missing: [],
      },
      ['topsecret'],
    )
    expect(JSON.stringify(masked)).not.toContain('topsecret')
  })
})
