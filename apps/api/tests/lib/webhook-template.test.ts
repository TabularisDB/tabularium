import { describe, it, expect } from 'bun:test'
import { renderTemplate, validateTemplate, TemplateError } from '../../src/lib/webhooks/template'

const ctx = {
  plugin: { name: 'Foo "Bar"\n<b>', id: 'foo', tags: ['a', 'b'], count: 3, empty: '' },
  event: { occurredAt: Date.UTC(2026, 0, 2, 3, 4, 5), reason: null },
  secrets: { URL: 'https://discord.com/api/webhooks/1/abc?x=1' },
}

const r = (src: string, mode: Parameters<typeof renderTemplate>[2] = 'text') => renderTemplate(src, ctx, mode).output

describe('webhook template', () => {
  it('escapes values as JSON string contents in json mode', () => {
    const out = r('{"name":"{{plugin.name}}"}', 'json')
    expect(JSON.parse(out).name).toBe('Foo "Bar"\n<b>')
  })

  it('json filter stringifies whole values', () => {
    expect(JSON.parse(r('{"p": {{plugin | json}}}', 'json')).p.tags).toEqual(['a', 'b'])
    expect(r('{{missing.thing | json}}', 'json')).toBe('null')
  })

  it('percent-encodes in url mode unless raw', () => {
    expect(r('https://x.test/?q={{plugin.name}}', 'url')).toBe(
      'https://x.test/?q=' + encodeURIComponent('Foo "Bar"\n<b>'),
    )
    expect(r('{{secrets.URL | raw}}', 'url')).toBe(ctx.secrets.URL)
  })

  it('strips CR/LF in header mode even with raw', () => {
    expect(r('{{plugin.name | raw}}', 'header')).toBe('Foo "Bar" <b>')
  })

  it('applies filters in order', () => {
    expect(r('{{plugin.name | html}}')).toBe('Foo &quot;Bar&quot;\n&lt;b&gt;')
    expect(r('{{plugin.id | upper}}')).toBe('FOO')
    expect(r('{{plugin.empty | default:"n/a"}}')).toBe('n/a')
    expect(r('{{plugin.empty | default:"a | b"}}')).toBe('a | b')
    expect(r('{{plugin.id | truncate:2}}')).toBe('f…')
    expect(r('{{event.occurredAt | date}}')).toBe('2026-01-02T03:04:05.000Z')
  })

  it('supports nested if/else', () => {
    expect(r('{{#if event.reason}}R{{else}}{{#if plugin.count}}C{{/if}}{{/if}}')).toBe('C')
    expect(r('{{#if plugin.tags}}yes{{else}}no{{/if}}')).toBe('yes')
  })

  it('reports missing placeholders', () => {
    expect(renderTemplate('{{plugin.nope}} {{owner.name}}', ctx, 'text').missing).toEqual(['plugin.nope', 'owner.name'])
  })

  it('never walks the prototype chain', () => {
    expect(r('{{plugin.constructor}}{{plugin.__proto__}}{{plugin.toString}}')).toBe('')
  })

  it('rejects malformed templates', () => {
    for (const bad of ['{{#if a}}x', '{{/if}}', '{{else}}', '{{a | nope}}', '{{a b}}', '{{a | default:"x}}']) {
      expect(() => validateTemplate(bad)).toThrow(TemplateError)
    }
  })
})
