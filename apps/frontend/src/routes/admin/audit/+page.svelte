<script lang="ts">
	import { onMount } from 'svelte'
	import Card from '$components/ui/Card.svelte'
	import CardContent from '$components/ui/CardContent.svelte'
	import CardHeader from '$components/ui/CardHeader.svelte'
	import CardTitle from '$components/ui/CardTitle.svelte'
	import CardDescription from '$components/ui/CardDescription.svelte'
	import { eden } from '$lib/eden'
	import { m } from '$lib/paraglide/messages'

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
			const { data, error } = await eden.api.admin.audit.get({ query: { limit: '200' } })
			if (error) throw error
			const res = data as { total: number; entries: AuditEntry[] }
			entries = res.entries
			total = res.total
		} finally {
			loading = false
		}
	})
</script>

<header class="space-y-1">
	<h1 class="text-2xl font-semibold tracking-tight">{m.admin_audit_title()}</h1>
	<p class="text-sm text-muted-foreground">{m.admin_audit_subtitle()}</p>
</header>

<Card>
	<CardHeader>
		<CardTitle class="text-base">{m.admin_audit_total_entries({ count: total })}</CardTitle>
		<CardDescription>{m.admin_audit_total_subtitle()}</CardDescription>
	</CardHeader>
	<CardContent>
		{#if loading}
			<p class="text-sm text-muted-foreground">{m.common_loading()}</p>
		{:else if entries.length === 0}
			<p class="text-sm text-muted-foreground">{m.admin_audit_empty()}</p>
		{:else}
			<div class="rounded-md border border-border overflow-x-auto">
				<table class="w-full text-sm">
					<thead class="border-b border-border bg-card/50">
						<tr class="text-left">
							<th class="font-medium px-3 py-2">{m.admin_audit_col_when()}</th>
							<th class="font-medium px-3 py-2">{m.admin_audit_col_actor()}</th>
							<th class="font-medium px-3 py-2">{m.admin_audit_col_action()}</th>
							<th class="font-medium px-3 py-2">{m.admin_audit_col_target()}</th>
							<th class="font-medium px-3 py-2">{m.admin_audit_col_ip()}</th>
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
