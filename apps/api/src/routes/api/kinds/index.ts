import { Elysia, t } from 'elysia'
import { getKinds } from '$lib/kinds'

const publicPageCopySchema = t.Object({
  hero: t.Nullable(t.String()),
  intro: t.Nullable(t.String()),
})

const kindSchema = t.Object({
  key: t.String(),
  label: t.String(),
  description: t.Nullable(t.String()),
  publicPageEnabled: t.Optional(t.Boolean()),
  publicPageCopy: t.Optional(t.Nullable(publicPageCopySchema)),
})

export default new Elysia().get(
  '/',
  () => ({
    kinds: getKinds().map((k) => ({
      key: k.key,
      label: k.label,
      description: k.description,
      ...(k.publicPageEnabled ? { publicPageEnabled: true } : {}),
      ...(k.publicPageCopy !== undefined ? { publicPageCopy: k.publicPageCopy } : {}),
    })),
  }),
  {
    detail: {
      tags: ['Plugins'],
      summary: 'List active plugin kinds',
      description:
        'Returns the registry-wide list of plugin kinds defined by the admin. ' +
        "Plugin authors mark a plugin's kind by adding the matching value to their `tags` field. " +
        'Public — no auth required. A kind may opt in to a dedicated public catalogue page at ' +
        '`/c/:key` via `publicPageEnabled`; consumers treat the field as falsy when absent.',
      operationId: 'listKinds',
    },
    response: { 200: t.Object({ kinds: t.Array(kindSchema) }) },
  },
)
