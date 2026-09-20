import { describe, expect, mock, test } from 'bun:test'
import { fetchDownloadStatistics, formatDownloadCount, parseDownloadStatistics } from '../src/lib/downloads'

const populated = {
  total: 1234567,
  versions: [{ version: '1.0.0', total: 1234567, platforms: { universal: 1234567 } }],
}

describe('download counts', () => {
  test.each([
    [0, '0'],
    [1, '1'],
    [999, '999'],
    [1234, '1.2K'],
    [1234567, '1.2M'],
    [1234567890, '1.2B'],
  ])('formats %s without confusing thousands and millions', (input, expected) => {
    expect(formatDownloadCount(input, 'en')).toBe(expected)
  })

  test.each([
    null,
    undefined,
    NaN,
    Infinity,
    -Infinity,
    -1,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
  ])('keeps invalid or unavailable counts separate from zero: %s', (value) =>
    expect(formatDownloadCount(value)).toBe('—'))

  test('provides exact locale-aware counts for accessible card labels', () => {
    expect(formatDownloadCount(1234567, 'en', false)).toBe('1,234,567')
    expect(formatDownloadCount(1234567, 'de', false)).toBe('1.234.567')
    expect(formatDownloadCount(1234567, 'zh-CN')).not.toBe(formatDownloadCount(1234567, 'en'))
  })
})

describe('read-only download statistics', () => {
  test('distinguishes a successful empty response from unavailable data', async () => {
    const request = mock(async () => ({ data: { total: 0, versions: [] }, error: null }))
    expect(await fetchDownloadStatistics(request)).toEqual({ status: 'ready', data: { total: 0, versions: [] } })
    expect(request).toHaveBeenCalledTimes(1)
  })

  test('preserves universal and platform counts without local increments', async () => {
    const request = mock(async () => ({ data: populated }))
    expect(await fetchDownloadStatistics(request)).toEqual({ status: 'ready', data: populated })
    expect(populated.total).toBe(1234567)
    expect(request).toHaveBeenCalledTimes(1)
  })

  test('does not retry a failed request or substitute zero', async () => {
    const request = mock(async () => {
      throw new Error('offline')
    })
    expect(await fetchDownloadStatistics(request)).toEqual({ status: 'unavailable' })
    expect(request).toHaveBeenCalledTimes(1)
  })

  test('honors an API error even if an old data object is supplied', async () => {
    expect(await fetchDownloadStatistics(async () => ({ data: populated, error: { status: 503 } }))).toEqual({
      status: 'unavailable',
    })
  })

  test.each([
    undefined,
    null,
    {},
    [],
    { total: 0 },
    { total: -1, versions: [] },
    { total: '0', versions: [] },
    { total: Infinity, versions: [] },
    { total: 0, versions: null },
    { total: 0, versions: [null] },
    { total: 0, versions: [{ version: '', total: 0, platforms: {} }] },
    { total: 0, versions: [{ version: '1.0.0', total: 1.5, platforms: {} }] },
    { total: 0, versions: [{ version: '1.0.0', total: 0, platforms: [] }] },
    { total: 0, versions: [{ version: '1.0.0', total: 0, platforms: { universal: -1 } }] },
    { total: 0, versions: [{ version: '1.0.0', total: 0, platforms: { universal: null } }] },
  ])('rejects malformed statistics: %j', async (data) => {
    expect(parseDownloadStatistics(data)).toBeNull()
    expect(await fetchDownloadStatistics(async () => ({ data }))).toEqual({ status: 'unavailable' })
  })

  test('copies API data without mutating it or assigning special keys to the prototype', () => {
    const input = JSON.parse('{"total":1,"versions":[{"version":"1.0.0","total":1,"platforms":{"__proto__":1}}]}')
    const before = JSON.stringify(input)
    const result = parseDownloadStatistics(input)
    expect(result).not.toBe(input)
    expect(JSON.stringify(input)).toBe(before)
    expect(Object.hasOwn(result!.versions[0].platforms, '__proto__')).toBe(true)
    expect(Object.getPrototypeOf(result!.versions[0].platforms)).toBe(Object.prototype)
  })
})
