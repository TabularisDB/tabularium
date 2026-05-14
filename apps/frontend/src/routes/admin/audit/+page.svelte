<script lang="ts">
	import { onMount } from 'svelte'
	import Card from '$components/ui/Card.svelte'
	import CardContent from '$components/ui/CardContent.svelte'
	import CardHeader from '$components/ui/CardHeader.svelte'
	import CardTitle from '$components/ui/CardTitle.svelte'
	import CardDescription from '$components/ui/CardDescription.svelte'
	import { api } from '$lib/api'

	type AuditEntry = {
		id: string
		actorId: string | null
		actorName: string | null
		action: string
		target: string | null
		meta: string | null
		ip: string | null
		createdAt: number
	}

	let entries = $state<AuditEntry[]>([])
	let total = $state(0)
	let loading = $state(true)

	onMount(async () => {
		try {
			const data = await api.get<{ total: number; entries: AuditEntry[] }>('/api/admin/audit?limit=200')
			entries = data.entries
			total = data.total
		} finally {
			loading = false
		}
	})
</script>

<header class="space-y-1">
	<h1 class="text-2xl font-semibold tracking-tight">Audit log</h1>
	<p class="text-sm text-muted-foreground">Last 200 admin actions on this instance.</p>
</header>

<Card>
	<CardHeader>
		<CardTitle class="text-base">{total} total entries</CardTitle>
		<CardDescription>Older entries are retained until manually pruned via SQL.</CardDescription>
	</CardHeader>
	<CardContent>
		{#if loading}
			<p class="text-sm text-muted-foreground">Loading…</p>
		{:else if entries.length === 0}
			<p class="text-sm text-muted-foreground">No actions recorded yet.</p>
		{:else}
			<div class="rounded-md border border-border overflow-x-auto">
				<table class="w-full text-sm">
					<thead class="border-b border-border bg-card/50">
						<tr class="text-left">
							<th class="font-medium px-3 py-2">When</th>
							<th class="font-medium px-3 py-2">Actor</th>
							<th class="font-medium px-3 py-2">Action</th>
							<th class="font-medium px-3 py-2">Target</th>
							<th class="font-medium px-3 py-2">IP</th>
						</tr>
					</thead>
					<tbody>
						{#each entries as e (e.id)}
							<tr class="border-b border-border/50 last:border-0">
								<td class="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">{new Date(e.createdAt).toLocaleString()}</td>
								<td class="px-3 py-2 text-xs">{e.actorName ?? '—'}</td>
								<td class="px-3 py-2 font-mono text-xs">{e.action}</td>
								<td class="px-3 py-2 text-xs text-muted-foreground">{e.target ?? '—'}</td>
								<td class="px-3 py-2 text-xs text-muted-foreground font-mono">{e.ip ?? '—'}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</CardContent>
</Card>
