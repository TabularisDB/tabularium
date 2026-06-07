<script lang="ts">
	import { invalidateAll, goto } from '$app/navigation'
	import { page as appPage } from '$app/state'
	import Plus from '@lucide/svelte/icons/plus'
	import Trash2 from '@lucide/svelte/icons/trash-2'
	import Card from '$components/ui/Card.svelte'
	import CardHeader from '$components/ui/CardHeader.svelte'
	import CardTitle from '$components/ui/CardTitle.svelte'
	import CardDescription from '$components/ui/CardDescription.svelte'
	import CardContent from '$components/ui/CardContent.svelte'
	import Button from '$components/ui/Button.svelte'
	import Input from '$components/ui/Input.svelte'
	import Label from '$components/ui/Label.svelte'
	import Select from '$components/ui/Select.svelte'
	import AdminPageHeader from '$components/admin/AdminPageHeader.svelte'
	import type { SuppressionListResponse, SuppressionSource } from './+page.js'

	type Props = { data: SuppressionListResponse & { source: SuppressionSource | null } }
	let { data }: Props = $props()

	let busy = $state(false)
	let banner = $state<{ kind: 'ok' | 'err'; text: string } | null>(null)
	let addEmail = $state('')
	let addReason = $state('')

	const filter = $derived(data.source ?? '')
	const pageCount = $derived(Math.max(1, Math.ceil(data.total / data.limit)))

	async function errMsg(res: Response): Promise<string> {
		try {
			const j = await res.json()
			if (j && typeof j === 'object' && 'error' in j && typeof j.error === 'string') return j.error
			return `Request failed (${res.status})`
		} catch {
			return `Request failed (${res.status})`
		}
	}

	function applyFilter(value: string) {
		const params = new URLSearchParams(appPage.url.searchParams)
		if (value) params.set('source', value)
		else params.delete('source')
		params.delete('page')
		const qs = params.toString()
		goto(qs ? `?${qs}` : '?', { keepFocus: true, noScroll: true })
	}

	function goPage(n: number) {
		const params = new URLSearchParams(appPage.url.searchParams)
		params.set('page', String(n))
		goto(`?${params.toString()}`, { keepFocus: true, noScroll: true })
	}

	async function add() {
		const email = addEmail.trim()
		if (!email) return
		busy = true
		banner = null
		try {
			const body: { email: string; reason?: string } = { email }
			const reason = addReason.trim()
			if (reason) body.reason = reason
			const res = await fetch('/api/admin/email/suppression', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body),
			})
			if (!res.ok) {
				banner = { kind: 'err', text: `Add failed: ${await errMsg(res)}` }
				return
			}
			const out = (await res.json()) as { ok: boolean; upstreamSynced: boolean }
			banner = {
				kind: 'ok',
				text: out.upstreamSynced ? 'Added (synced upstream).' : 'Added (upstream sync skipped or failed).',
			}
			addEmail = ''
			addReason = ''
			await invalidateAll()
		} catch (e) {
			banner = { kind: 'err', text: e instanceof Error ? e.message : 'Add failed' }
		} finally {
			busy = false
		}
	}

	async function remove(email: string) {
		if (!confirm(`Remove ${email} from the suppression list?`)) return
		busy = true
		banner = null
		try {
			const res = await fetch(`/api/admin/email/suppression/${encodeURIComponent(email)}`, {
				method: 'DELETE',
			})
			if (!res.ok) {
				banner = { kind: 'err', text: `Remove failed: ${await errMsg(res)}` }
				return
			}
			const out = (await res.json()) as { ok: boolean; upstreamSynced: boolean }
			banner = {
				kind: 'ok',
				text: out.upstreamSynced ? 'Removed (synced upstream).' : 'Removed (upstream skipped).',
			}
			await invalidateAll()
		} catch (e) {
			banner = { kind: 'err', text: e instanceof Error ? e.message : 'Remove failed' }
		} finally {
			busy = false
		}
	}
</script>

<AdminPageHeader
	title="Email suppression"
	subtitle="Bounces, spam complaints, unsubscribes, and manual blocks. Local entries sync to TurboSMTP when configured."
>
	{#snippet actions()}
		<Button variant="outline" size="sm" href="/admin/email">Back to email settings</Button>
	{/snippet}
</AdminPageHeader>

{#if banner}
	<div
		class={[
			'rounded-md border px-3 py-2 text-xs',
			banner.kind === 'ok'
				? 'border-success/40 bg-success/10 text-success-foreground'
				: 'border-destructive/40 bg-destructive/10 text-destructive-foreground',
		].join(' ')}
	>
		{banner.text}
	</div>
{/if}

<Card>
	<CardHeader>
		<CardTitle class="text-base">Add a suppression</CardTitle>
		<CardDescription>Manually block an address from receiving mail.</CardDescription>
	</CardHeader>
	<CardContent>
		<div class="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3 items-end">
			<div class="grid gap-2">
				<Label for="add-email">Email</Label>
				<Input id="add-email" type="email" bind:value={addEmail} placeholder="user@example.com" />
			</div>
			<div class="grid gap-2">
				<Label for="add-reason">Reason (optional)</Label>
				<Input id="add-reason" bind:value={addReason} placeholder="Manually added" />
			</div>
			<Button size="sm" onclick={add} disabled={busy || !addEmail.trim()}>
				<Plus class="h-3.5 w-3.5" />
				Add
			</Button>
		</div>
	</CardContent>
</Card>

<Card>
	<CardHeader>
		<CardTitle class="text-base">Suppression list</CardTitle>
		<CardDescription>
			Page {data.page} of {pageCount} — {data.total} total
		</CardDescription>
	</CardHeader>
	<CardContent class="space-y-4">
		<div class="flex flex-wrap items-center gap-3">
			<Label for="source-filter" class="text-xs">Filter</Label>
			<div class="max-w-[14rem]">
				<Select
					id="source-filter"
					value={filter}
					onchange={(e) => applyFilter((e.currentTarget as HTMLSelectElement).value)}
				>
					<option value="">All sources</option>
					<option value="bounce">Bounce</option>
					<option value="complaint">Complaint</option>
					<option value="manual">Manual</option>
					<option value="unsubscribe">Unsubscribe</option>
				</Select>
			</div>
		</div>

		{#if data.rows.length === 0}
			<p class="text-sm text-muted-foreground py-6 text-center">No suppressions match the current filter.</p>
		{:else}
			<div class="overflow-x-auto rounded-md border border-border">
				<table class="w-full text-sm">
					<thead class="bg-muted/40">
						<tr class="text-left text-xs uppercase text-muted-foreground">
							<th class="py-2 px-3 font-medium">Email</th>
							<th class="py-2 px-3 font-medium">Source</th>
							<th class="py-2 px-3 font-medium">Reason</th>
							<th class="py-2 px-3 font-medium">Added</th>
							<th class="py-2 px-3 text-right font-medium">Action</th>
						</tr>
					</thead>
					<tbody>
						{#each data.rows as row (row.email)}
							<tr class="border-t border-border">
								<td class="py-2 px-3 font-mono text-xs break-all">{row.email}</td>
								<td class="py-2 px-3 text-xs">{row.source}</td>
								<td class="py-2 px-3 text-xs text-muted-foreground">{row.reason ?? '—'}</td>
								<td class="py-2 px-3 text-xs text-muted-foreground">
									{new Date(row.addedAt).toISOString().slice(0, 10)}
								</td>
								<td class="py-2 px-3 text-right">
									<Button
										variant="ghost"
										size="sm"
										onclick={() => remove(row.email)}
										disabled={busy}
										aria-label={`Remove ${row.email}`}
									>
										<Trash2 class="h-3.5 w-3.5" />
										Remove
									</Button>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

			<div class="flex items-center justify-end gap-2">
				<Button variant="outline" size="sm" disabled={data.page <= 1} onclick={() => goPage(data.page - 1)}>
					Previous
				</Button>
				<Button
					variant="outline"
					size="sm"
					disabled={data.page >= pageCount}
					onclick={() => goPage(data.page + 1)}
				>
					Next
				</Button>
			</div>
		{/if}
	</CardContent>
</Card>
