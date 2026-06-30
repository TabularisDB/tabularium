import { error, type Load } from '@sveltejs/kit'

/**
 * Loader for the TurboSMTP-branded admin page.
 *
 * Email settings are required (they reveal whether keys are configured); the
 * stats and consumer-keys endpoints both return 412 until keys are saved, so
 * the loader degrades gracefully and lets the page render the "not configured
 * yet" state.
 */
export const load: Load = async ({ fetch }) => {
	const settingsRes = await fetch('/api/admin/email')
	if (!settingsRes.ok) throw error(settingsRes.status, await settingsRes.text())
	const settings = (await settingsRes.json()) as EmailSettings

	let stats: TurboStats | null = null
	let statsError: string | null = null
	let consumerKeys: TurboConsumerKey[] | null = null
	let consumerKeysError: string | null = null
	let suppressionCount: number | null = null

	if (settings.turbo.apiKeySet) {
		const [statsRes, keysRes, supRes] = await Promise.all([
			fetch('/api/admin/email/turbosmtp/stats'),
			fetch('/api/admin/email/turbosmtp/consumer-keys'),
			fetch('/api/admin/email/suppression?limit=1'),
		])
		if (statsRes.ok) stats = (await statsRes.json()) as TurboStats
		else statsError = await readError(statsRes)
		if (keysRes.ok) {
			const body = (await keysRes.json()) as { count: number; keys: TurboConsumerKey[] }
			consumerKeys = body.keys
		} else consumerKeysError = await readError(keysRes)
		if (supRes.ok) {
			const body = (await supRes.json()) as { total: number }
			suppressionCount = body.total
		}
	}

	return { settings, stats, statsError, consumerKeys, consumerKeysError, suppressionCount }
}

async function readError(res: Response): Promise<string> {
	try {
		const j = await res.json()
		if (j && typeof j === 'object' && 'error' in j && typeof j.error === 'string') return j.error
		return `Request failed (${res.status})`
	} catch {
		return `Request failed (${res.status})`
	}
}

export type EmailSettings = {
	provider: 'turbo' | 'smtp' | null
	from: { default: string; overrides: Record<string, string> }
	turbo: {
		apiKeySet: boolean
		consumerKey: string | null
		consumerSecretSet: boolean
		region: 'global' | 'eu'
	}
	smtp: {
		host: string | null
		port: number | null
		user: string | null
		passSet: boolean
		tls: boolean
	}
}

export type TurboHourlyBucket = {
	hour: string
	sent: number
	delivered: number
	failed: number
}

export type TurboStats = {
	windowHours: number
	totalSent: number
	delivered: number
	failed: number
	bounced: number
	opened: number
	clicked: number
	unsubscribed: number
	deliveryRate: number
	hourly: TurboHourlyBucket[]
}

export type TurboConsumerKey = {
	consumerKey: string
	label?: string
	creationTime?: string
}
