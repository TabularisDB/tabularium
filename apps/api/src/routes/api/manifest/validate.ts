import { Elysia, t } from 'elysia'
import { validateManifest, parseManifest, sniffSource, ParseError } from '@tabularium/manifest'
import { buildMergedSchema } from '$lib/manifest-schema'

const MAX_BYTES = 64 * 1024

export default new Elysia()
  .onError(({ code, set }) => {
    if (code === 'VALIDATION') {
      set.status = 400
      return { error: 'invalid request body' }
    }
  })
  .post(
    '/',
    ({ body, set }) => {
      const text = body.text
      if (Buffer.byteLength(text, 'utf8') > MAX_BYTES) {
        set.status = 413
        return { error: 'manifest exceeds 64 KiB cap' }
      }
      const source = body.source ?? sniffSource(text)
      let parsed: Record<string, unknown>
      try {
        parsed = parseManifest(text, source)
      } catch (err) {
        if (err instanceof ParseError) {
          return { ok: false, errors: [{ path: '/', code: 'parse', message: err.message }] }
        }
        throw err
      }

      const schema = buildMergedSchema({ kind: body.kind ?? null })
      const result = validateManifest(parsed, schema)  // strict, no lenient
      if (result.ok) {
        return { ok: true, normalized: result.normalized }
      }
      return { ok: false, errors: result.errors }
    },
    {
      body: t.Object({
        text: t.String(),
        source: t.Optional(t.Union([t.Literal('tabularium.yaml'), t.Literal('tabularium.json')])),
        kind: t.Optional(t.String({ maxLength: 40 })),
      }),
      detail: {
        tags: ['Plugins'],
        summary: 'Validate a manifest body against the registry schema',
        description: 'Public validator for authoring tools / CI. Returns 200 + ok:false on validation failure so HTTP-status-branching tools always reach the body. 4xx is reserved for malformed requests and oversized bodies.',
        operationId: 'validateManifest',
      },
    },
  )
