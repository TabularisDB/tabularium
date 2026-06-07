import { error, type Load } from '@sveltejs/kit'

const SOURCES = ['bounce', 'complaint', 'manual', 'unsubscribe'] as const
export type SuppressionSource = (typeof SOURCES)[number]

export type SuppressionRow = {
	email: string
	source: SuppressionSource
	reason: string | null
	addedAt: number
}

export type SuppressionListResponse = {
	rows: SuppressionRow[]
	total: number
	page: number
	limit: number
}

function isSource(value: string | null): value is SuppressionSource {
	return value !== null && (SOURCES as readonly string[]).includes(value)
}

export const load: Load = async ({ fetch, url }) => {
	const pageRaw = Number(url.searchParams.get('page') ?? '1')
	const limitRaw = Number(url.searchParams.get('limit') ?? '50')
	const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1
	const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.floor(limitRaw) : 50
	const sourceParam = url.searchParams.get('source')
	const source: SuppressionSource | null = isSource(sourceParam) ? sourceParam : null

	const qs = new URLSearchParams({ page: String(page), limit: String(limit) })
	if (source) qs.set('source', source)

	const res = await fetch(`/api/admin/email/suppression?${qs.toString()}`)
	if (!res.ok) throw error(res.status, await res.text())
	const data = (await res.json()) as SuppressionListResponse
	return { ...data, source }
}
