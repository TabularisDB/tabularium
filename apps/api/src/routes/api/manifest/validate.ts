import { Elysia, t } from 'elysia'
import { parse as parseYaml } from 'yaml'
import { validateManifest, type ValidationError } from '@tabularium/manifest'
import { buildMergedSchema } from '$lib/manifest-schema'

const MAX_BYTES = 64 * 1024

function sniffSource(text: string): 'tabularium.json' | 'tabularium.yaml' {
  const head = text.replace(/^﻿/, '').trimStart()
  return head.startsWith('{') || head.startsWith('[') ? 'tabularium.json' : 'tabularium.yaml'
}

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
      let parsed: unknown
      try {
        parsed = source === 'tabularium.json' ? JSON.parse(text) : parseYaml(text)
      } catch (err) {
        const errors: ValidationError[] = [{
          path: '/',
          code: 'parse',
          message: err instanceof Error ? err.message : String(err),
        }]
        return { ok: false, errors }
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return {
          ok: false,
          errors: [{ path: '/', code: 'type', message: 'Manifest root must be an object' }],
        }
      }
      const obj = parsed as Record<string, unknown>
      if ('$schema' in obj) delete obj.$schema

      const schema = buildMergedSchema({ kind: body.kind ?? null })
      const result = validateManifest(obj, schema)
      if (result.ok) {
        return { ok: true, normalized: result.normalized, warnings: [] }
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
