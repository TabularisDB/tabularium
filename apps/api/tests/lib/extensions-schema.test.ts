import { describe, it, expect } from 'bun:test'
import { validateExtensionsDelta } from '../../src/lib/extensions-schema'

describe('x-translations annotation', () => {
  it('accepts an x-translations map alongside description', () => {
    const out = validateExtensionsDelta({
      myProp: {
        type: 'string',
        description: 'Default description',
        'x-translations': { de: 'Beschreibung auf Deutsch', fr: 'Description en français' },
      },
    })
    expect((out.myProp as Record<string, unknown>)['x-translations']).toEqual({
      de: 'Beschreibung auf Deutsch',
      fr: 'Description en français',
    })
  })

  it('rejects unknown locale in x-translations', () => {
    expect(() =>
      validateExtensionsDelta({
        myProp: { type: 'string', 'x-translations': { 'xx-YY': 'bogus' } },
      }),
    ).toThrow(/unsupported locale/)
  })

  it('rejects oversize translation value', () => {
    expect(() =>
      validateExtensionsDelta({
        myProp: { type: 'string', 'x-translations': { de: 'x'.repeat(2001) } },
      }),
    ).toThrow(/exceeds 2000 chars/)
  })

  it('rejects non-string translation value', () => {
    expect(() =>
      validateExtensionsDelta({
        myProp: { type: 'string', 'x-translations': { de: 42 } },
      }),
    ).toThrow(/must be a string/)
  })

  it('accepts x-translations on nested property descriptions', () => {
    const out = validateExtensionsDelta({
      parentProp: {
        type: 'object',
        properties: {
          child: {
            type: 'string',
            description: 'Child desc',
            'x-translations': { de: 'Kind-Beschreibung' },
          },
        },
      },
    })
    const child = (out.parentProp as { properties: { child: Record<string, unknown> } }).properties.child
    expect(child['x-translations']).toEqual({ de: 'Kind-Beschreibung' })
  })
})
