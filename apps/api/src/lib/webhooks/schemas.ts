import { t } from 'elysia'

const header = t.Object({ name: t.String({ maxLength: 128 }), value: t.String({ maxLength: 4096 }) })

const fields = {
  name: t.String({ minLength: 1, maxLength: 120 }),
  enabled: t.Boolean(),
  preset: t.Nullable(t.String({ maxLength: 40 })),
  events: t.Array(t.String({ maxLength: 80 }), { maxItems: 50 }),
  method: t.String({ maxLength: 10 }),
  url: t.String({ minLength: 1, maxLength: 2048 }),
  headers: t.Array(header, { maxItems: 30 }),
  body: t.Nullable(t.String({ maxLength: 65536 })),
  contentType: t.String({ minLength: 1, maxLength: 120 }),
  secrets: t.Record(t.String({ maxLength: 64 }), t.Nullable(t.String({ maxLength: 4096 }))),
  signingSecret: t.Nullable(t.String({ maxLength: 256 })),
}

export const createBody = t.Object({
  name: fields.name,
  events: fields.events,
  url: fields.url,
  enabled: t.Optional(fields.enabled),
  preset: t.Optional(fields.preset),
  method: t.Optional(fields.method),
  headers: t.Optional(fields.headers),
  body: t.Optional(fields.body),
  contentType: t.Optional(fields.contentType),
  secrets: t.Optional(fields.secrets),
  signingSecret: t.Optional(fields.signingSecret),
})

export const patchBody = t.Partial(t.Object(fields))

// Unsaved definition for live preview in the editor.
export const draftBody = t.Object({
  method: t.Optional(fields.method),
  url: fields.url,
  headers: t.Optional(fields.headers),
  body: t.Optional(fields.body),
  contentType: t.Optional(fields.contentType),
})
