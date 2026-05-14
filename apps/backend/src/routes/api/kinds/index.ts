import { Elysia, t } from 'elysia'
import { getKinds } from '$lib/kinds'

const kindSchema = t.Object({
  key: t.String(),
  label: t.String(),
  description: t.Nullable(t.String()),
})

export default new Elysia()
  .get('/', () => ({ kinds: getKinds() }), {
    detail: {
      tags: ['Plugins'],
      summary: 'List active plugin kinds',
      description:
        'Returns the registry-wide list of plugin kinds defined by the admin. ' +
        'Plugin authors mark a plugin\'s kind by adding the matching value to their `tags` field. ' +
        'Public — no auth required.',
      operationId: 'listKinds',
    },
    response: { 200: t.Object({ kinds: t.Array(kindSchema) }) },
  })
