import { Elysia, t } from 'elysia'
import { adminMw } from '../host-handles'
import { buildTurboClient } from '../client'

const HourlyBucketSchema = t.Object({
  hour: t.String({ description: 'ISO timestamp truncated to the hour' }),
  sent: t.Number(),
  delivered: t.Number(),
  failed: t.Number(),
})

const StatsResponseSchema = t.Object({
  windowHours: t.Number(),
  totalSent: t.Number(),
  delivered: t.Number(),
  failed: t.Number(),
  bounced: t.Number(),
  opened: t.Number(),
  clicked: t.Number(),
  unsubscribed: t.Number(),
  deliveryRate: t.Number({ description: '0..1 — delivered / totalSent (0 when no sends)' }),
  hourly: t.Array(HourlyBucketSchema),
})

const ErrorSchema = t.Object({ error: t.String() })

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function isoDate(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`
}

function parseSendTime(s?: string | null): Date | null {
  if (!s) return null
  // turboSMTP send_time is "YYYY-MM-DD HH:MM:SS" — promote to UTC.
  const iso = s.includes('T') ? s : `${s.replace(' ', 'T')}Z`
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

function bucketKey(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}T${pad2(d.getUTCHours())}:00:00Z`
}

export default function buildStatsRoute() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new Elysia().use(adminMw() as any).get(
    '/',
    async ({ set }) => {
      const client = buildTurboClient()
      if (!client) {
        set.status = 412
        return { error: 'TurboSMTP not configured — save API key first' }
      }

      const now = new Date()
      const since = new Date(now.getTime() - 24 * 60 * 60 * 1000)
      // Bucket scaffold so empty hours still show on the chart.
      const buckets = new Map<string, { hour: string; sent: number; delivered: number; failed: number }>()
      for (let h = 0; h < 24; h++) {
        const d = new Date(since.getTime() + h * 60 * 60 * 1000)
        const key = bucketKey(d)
        buckets.set(key, { hour: key, sent: 0, delivered: 0, failed: 0 })
      }

      let totalSent = 0
      let delivered = 0
      let failed = 0
      let bounced = 0
      let opened = 0
      let clicked = 0
      let unsubscribed = 0

      try {
        const page = await client.analytics.list({
          from: isoDate(since),
          to: isoDate(now),
          limit: 500,
          tz: 'UTC',
        })
        for await (const row of page) {
          const t0 = parseSendTime(row.send_time)
          if (!t0 || t0 < since) continue
          totalSent++
          const status = row.status ?? 'NEW'
          if (status === 'SUCCESS' || status === 'OPEN' || status === 'CLICK') delivered++
          if (status === 'OPEN' || status === 'CLICK') opened++
          if (status === 'CLICK') clicked++
          if (status === 'UNSUB') unsubscribed++
          if (status === 'FAIL' || status === 'SYSFAIL' || status === 'DEFER') failed++
          if (status === 'FAIL') bounced++
          const bk = bucketKey(t0)
          const bucket = buckets.get(bk)
          if (bucket) {
            bucket.sent++
            if (status === 'SUCCESS' || status === 'OPEN' || status === 'CLICK') bucket.delivered++
            if (status === 'FAIL' || status === 'SYSFAIL') bucket.failed++
          }
        }
      } catch (err) {
        const reason = err instanceof Error ? err.message : 'unknown'
        set.status = 502
        return { error: `TurboSMTP analytics fetch failed: ${reason}` }
      }

      const deliveryRate = totalSent === 0 ? 0 : delivered / totalSent
      const hourly = [...buckets.values()].sort((a, b) => a.hour.localeCompare(b.hour))

      return {
        windowHours: 24,
        totalSent,
        delivered,
        failed,
        bounced,
        opened,
        clicked,
        unsubscribed,
        deliveryRate,
        hourly,
      }
    },
    {
      detail: {
        tags: ['Admin'],
        summary: 'TurboSMTP — last 24h send / delivery stats',
        operationId: 'getTurbosmtpStats',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      },
      response: {
        200: StatsResponseSchema,
        412: ErrorSchema,
        502: ErrorSchema,
      },
    },
  )
}
