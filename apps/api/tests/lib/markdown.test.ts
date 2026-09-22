import { describe, expect, test } from 'bun:test'
import { renderMarkdown } from '$lib/markdown'

describe('renderMarkdown sanitization', () => {
  test('strips scripts, event handlers and javascript: urls', async () => {
    const html = await renderMarkdown(
      '<script>bad()</script><a href="javascript:alert(1)" onclick="x()">j</a><img src=x onerror=alert(1)>\n\n<svg onload=alert(1)></svg>',
    )
    expect(html).not.toContain('<script')
    expect(html).not.toContain('onclick')
    expect(html).not.toContain('onerror')
    expect(html).not.toContain('onload')
    expect(html).not.toContain('javascript:')
  })

  test('keeps shiki inline styles, classes, links and images', async () => {
    const html = await renderMarkdown('```ts\nconst a = 1\n```\n\n[l](https://x.y) ![i](https://i.png)')
    expect(html).toContain('class="shiki')
    expect(html).toContain('style="')
    expect(html).toContain('href="https://x.y"')
    expect(html).toContain('src="https://i.png"')
  })

  test('does not grow memory across many renders', async () => {
    const md = '# t\n\nhello **b** <b onclick="x">y</b>\n\n```ts\nconst a = 1\n```\n'.repeat(20)
    for (let i = 0; i < 50; i++) await renderMarkdown(md + i)
    Bun.gc(true)
    const before = process.memoryUsage().rss
    for (let i = 0; i < 300; i++) await renderMarkdown(md + i)
    Bun.gc(true)
    const grownMiB = (process.memoryUsage().rss - before) / 1048576
    expect(grownMiB).toBeLessThan(60) // jsdom-backed DOMPurify grew ~120 MiB here
  })
})
