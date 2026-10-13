import { t, type Static } from 'elysia'
import { Value } from '@sinclair/typebox/value'

export const REQUEST_STATUSES = ['pending', 'approved', 'rejected', 'fulfilled'] as const
export type RequestStatus = (typeof REQUEST_STATUSES)[number]

// Statuses anyone can list. `pending` and `rejected` are only visible to
// admins and to the user who filed the request.
export const PUBLIC_REQUEST_STATUSES: RequestStatus[] = ['approved', 'fulfilled']

export function isRequestStatus(v: string): v is RequestStatus {
  return (REQUEST_STATUSES as readonly string[]).includes(v)
}

// Label an admin picks for an approved request that nobody is working on yet.
// "In progress" (claims > 0) and "shipped" (fulfilled) are derived, never set.
export const BOARD_STATUSES = ['open', 'most-wanted', 'scoped', 'coming-soon'] as const

export const bountySchema = t.Object(
  {
    boardStatus: t.Optional(
      t.Union([t.Literal('open'), t.Literal('most-wanted'), t.Literal('scoped'), t.Literal('coming-soon')], {
        description: 'Board label while nobody has claimed the request. Default `open`.',
      }),
    ),
    tagline: t.Optional(t.String({ maxLength: 200 })),
    stage: t.Optional(t.String({ maxLength: 120 })),
    nextStep: t.Optional(t.String({ maxLength: 1000 })),
    difficulty: t.Optional(t.Union([t.Literal('Low'), t.Literal('Medium'), t.Literal('High'), t.Literal('Extreme')])),
    accent: t.Optional(t.String({ pattern: '^#[0-9a-fA-F]{6}$', description: 'Hex color, e.g. `#ff5a3d`.' })),
    radar: t.Optional(
      t.Object({
        x: t.Number({ minimum: 0, maximum: 100 }),
        y: t.Number({ minimum: 0, maximum: 100 }),
        scale: t.Number({ minimum: 0.1, maximum: 3 }),
      }),
    ),
    tags: t.Optional(t.Array(t.String({ minLength: 1, maxLength: 40 }), { maxItems: 12 })),
    capabilities: t.Optional(
      t.Array(
        t.Object({
          label: t.String({ minLength: 1, maxLength: 60 }),
          state: t.Union([t.Literal('ready'), t.Literal('needed'), t.Literal('stretch')]),
        }),
        { maxItems: 24 },
      ),
    ),
    signal: t.Optional(t.String({ maxLength: 500 })),
    sponsorUrl: t.Optional(t.String({ maxLength: 500 })),
  },
  { additionalProperties: false, description: 'Bounty board metadata shown on the request.' },
)

export type Bounty = Static<typeof bountySchema>

// Stored as JSON text. Anything unreadable or no longer matching the schema
// is treated as "no metadata" rather than breaking the listing.
export function parseBounty(raw: string | null | undefined): Bounty | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as unknown
    return Value.Check(bountySchema, value) ? value : null
  } catch {
    return null
  }
}
