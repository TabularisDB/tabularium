import { describe, expect, test } from 'bun:test'
import { renderReadme } from '$lib/readme'

describe('renderReadme', () => {
  const repo = 'https://github.com/Xrondev/tabularis-opensearch-plugin-go.git/'

  test('resolves Markdown and HTML links and images against the GitHub repository', async () => {
    const html = await renderReadme(
      '[Compatibility](docs/compatibility.md?view=1#matrix)\n\n' +
        '<a href="./docs/specification.md">Specification</a>\n\n' +
        '![Preview](./images/preview.png)\n\n<img src="images/icon.png">',
      repo,
    )
    expect(html).toContain(
      'href="https://github.com/Xrondev/tabularis-opensearch-plugin-go/blob/HEAD/docs/compatibility.md?view=1#matrix"',
    )
    expect(html).toContain(
      'href="https://github.com/Xrondev/tabularis-opensearch-plugin-go/blob/HEAD/docs/specification.md"',
    )
    expect(html).toContain(
      'src="https://raw.githubusercontent.com/Xrondev/tabularis-opensearch-plugin-go/HEAD/images/preview.png"',
    )
    expect(html).toContain(
      'src="https://raw.githubusercontent.com/Xrondev/tabularis-opensearch-plugin-go/HEAD/images/icon.png"',
    )
  })

  test('preserves anchors and absolute URLs and still sanitizes unsafe URLs', async () => {
    const html = await renderReadme(
      '[Limitations](#limitations) [External](https://example.com/docs) [Email](mailto:dev@example.com)\n\n' +
        '<a href="//example.com/docs">External</a><a href="/api/docs">API</a>\n\n' +
        '<a href="javascript:alert(1)" onclick="bad()">Unsafe</a><img src="javascript:bad()">',
      repo,
    )
    expect(html).toContain('href="#limitations"')
    expect(html).toContain('href="https://example.com/docs"')
    expect(html).toContain('href="mailto:dev@example.com"')
    expect(html).toContain('href="//example.com/docs"')
    expect(html).toContain('href="/api/docs" data-sveltekit-reload')
    expect(html).not.toContain('javascript:')
    expect(html).not.toContain('onclick')
  })

  test.each([
    'invalid',
    'https://codeberg.org/owner/repo',
  ])('keeps rendering without GitHub resolution for %s', async (repoUrl) => {
    const html = await renderReadme('[Docs](docs/guide.md)', repoUrl)
    expect(html).toContain('href="docs/guide.md"')
  })
})
