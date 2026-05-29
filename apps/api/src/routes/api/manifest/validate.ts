import { Elysia, t } from 'elysia'
import { validateManifest, parseManifest, sniffSource, ParseError } from '@tabularium/manifest'
import { buildMergedSchema } from '$lib/manifest-schema'
import { getKinds } from '$lib/kinds'
import { getSetting } from '$lib/settings'

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
      const result = validateManifest(parsed, schema) // strict, no lenient
      if (!result.ok) {
        return { ok: false, errors: result.errors }
      }
      // Mirror the manifest.require_kind policy that gates real submissions —
      // dev tooling pinging this endpoint should see the same accept/reject
      // verdict the registry will apply when the manifest is submitted.
      if (getSetting('manifest.require_kind') === '1') {
        const kinds = getKinds()
        if (kinds.length > 0) {
          const declared = typeof result.normalized.kind === 'string' ? result.normalized.kind : null
          if (!declared) {
            return {
              ok: false,
              errors: [
                {
                  path: '/kind',
                  code: 'required',
                  message: `manifest must declare a kind — pick one of: ${kinds.map((k) => k.key).join(', ')}`,
                },
              ],
            }
          }
          if (!kinds.some((k) => k.key === declared)) {
            return {
              ok: false,
              errors: [
                {
                  path: '/kind',
                  code: 'enum',
                  message: `kind "${declared}" is not in this registry — pick one of: ${kinds.map((k) => k.key).join(', ')}`,
                },
              ],
            }
          }
        }
      }
      return { ok: true, normalized: result.normalized }
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
        description:
          'Public validator for authoring tools / CI. Returns 200 + ok:false on validation failure so HTTP-status-branching tools always reach the body. 4xx is reserved for malformed requests and oversized bodies.',
        operationId: 'validateManifest',
      },
    },
  )
