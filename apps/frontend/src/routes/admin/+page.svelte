<script lang="ts">
	import { onMount } from 'svelte'
	import Plug from '@lucide/svelte/icons/plug'
	import UsersRound from '@lucide/svelte/icons/users-round'
	import Boxes from '@lucide/svelte/icons/boxes'
	import AlertTriangle from '@lucide/svelte/icons/triangle-alert'
	import Activity from '@lucide/svelte/icons/activity'
	import Card from '$components/ui/Card.svelte'
	import CardContent from '$components/ui/CardContent.svelte'
	import Badge from '$components/ui/Badge.svelte'
	import { eden } from '$lib/eden'
	import type { ProviderInstanceAdmin, AdminUser } from '$lib/types'
	import { m } from '$lib/paraglide/messages'

	type AdminPluginRow = {
		id: string
		name: string
		status: 'approved' | 'pending' | 'rejected'
		latestVersion: string | null
		createdAt: number
		updatedAt: number
	}

	type AuditEntry = {
		id: string
		actorName: string | null
		action: string
		target: string | null
		createdAt: number
	}

	let counts = $state({
		providers: 0,
		providersEnabled: 0,
		users: 0,
		admins: 0,
		pluginsApproved: 0,
		pluginsPending: 0,
		pluginsRejected: 0,
	})
	let recent = $state<AdminPluginRow[]>([])
	let audit = $state<AuditEntry[]>([])
	let loading = $state(true)
	let health = $state<{
		ok: boolean
		uptimeSeconds: number
		checks: Record<string, { ok: boolean; detail?: string }>
	} | null>(null)

	onMount(async () => {
		try {
			const [piRes, usRes, approvedRes, pendingRes, rejectedRes, auditRes, healthRes] = await Promise.all([
				eden.api.admin['provider-instances'].get(),
				eden.api.admin.users.get(),
				eden.api.admin.plugins.get({ query: { status: 'approved' } }),
				eden.api.admin.plugins.get({ query: { status: 'pending' } }),
				eden.api.admin.plugins.get({ query: { status: 'rejected' } }),
				eden.api.admin.audit.get({ query: { limit: '8' } }),
				eden.healthz.get(),
			])
			if (piRes.error) throw piRes.error
			if (usRes.error) throw usRes.error
			if (approvedRes.error) throw approvedRes.error
			if (pendingRes.error) throw pendingRes.error
			if (rejectedRes.error) throw rejectedRes.error
			const pi = piRes.data as { instances: ProviderInstanceAdmin[] }
			const us = usRes.data as { users: AdminUser[] }
			const approved = approvedRes.data as { total: number; plugins: AdminPluginRow[] }
			const pending = pendingRes.data as { total: number; plugins: AdminPluginRow[] }
			const rejected = rejectedRes.data as { total: number; plugins: AdminPluginRow[] }
			const auditData = (auditRes.data ?? { entries: [] }) as { entries: AuditEntry[] }
			const healthData = (healthRes.data ?? null) as typeof health
			counts = {
				providers: pi.instances.length,
				providersEnabled: pi.instances.filter((i) => i.enabled).length,
				users: us.users.length,
				admins: us.users.filter((u) => u.role === 'admin').length,
				pluginsApproved: approved.total,
				pluginsPending: pending.total,
				pluginsRejected: rejected.total,
			}
			const sorted = [...approved.plugins, ...pending.plugins, ...rejected.plugins]
				.sort((a, b) => b.updatedAt - a.updatedAt)
				.slice(0, 5)
			recent = sorted
			audit = auditData.entries
			health = healthData
		} finally {
			loading = false
		}
	})

	function relative(ts: number): string {
		const diff = Date.now() - ts
		const minutes = Math.floor(diff / 60_000)
		if (minutes < 1) return m.admin_overview_time_just_now()
		if (minutes < 60) return m.admin_overview_time_minutes({ count: minutes })
		const hours = Math.floor(minutes / 60)
		if (hours < 24) return m.admin_overview_time_hours({ count: hours })
		const days = Math.floor(hours / 24)
		return m.admin_overview_time_days({ count: days })
	}
</script>

<header class="space-y-1">
	<h1 class="text-2xl font-semibold tracking-tight">{m.admin_overview_title()}</h1>
	<p class="text-sm text-muted-foreground">{m.admin_overview_subtitle()}</p>
</header>

<div class="grid grid-cols-2 md:grid-cols-4 gap-4">
	<Card>
		<CardContent class="p-5 space-y-2">
			<div class="flex items-center justify-between">
				<span class="text-sm text-muted-foreground">{m.admin_overview_providers()}</span>
				<Plug class="h-4 w-4 text-muted-foreground" />
			</div>
			<div class="text-3xl font-semibold tracking-tight">{loading ? '—' : counts.providers}</div>
			<div class="text-xs text-muted-foreground">
				{m.admin_overview_providers_enabled({ count: counts.providersEnabled })}
			</div>
		</CardContent>
	</Card>
	<Card>
		<CardContent class="p-5 space-y-2">
			<div class="flex items-center justify-between">
				<span class="text-sm text-muted-foreground">{m.admin_overview_users()}</span>
				<UsersRound class="h-4 w-4 text-muted-foreground" />
			</div>
			<div class="text-3xl font-semibold tracking-tight">{loading ? '—' : counts.users}</div>
			<div class="text-xs text-muted-foreground">{m.admin_overview_users_admin({ count: counts.admins })}</div>
		</CardContent>
	</Card>
	<Card>
		<CardContent class="p-5 space-y-2">
			<div class="flex items-center justify-between">
				<span class="text-sm text-muted-foreground">{m.admin_overview_approved_plugins()}</span>
				<Boxes class="h-4 w-4 text-muted-foreground" />
			</div>
			<div class="text-3xl font-semibold tracking-tight">{loading ? '—' : counts.pluginsApproved}</div>
			<div class="text-xs text-muted-foreground">{m.admin_overview_approved_live()}</div>
		</CardContent>
	</Card>
	<a href="/admin/plugins?status=pending" class="block">
		<Card class={counts.pluginsPending > 0 ? 'border-warning/40' : ''}>
			<CardContent class="p-5 space-y-2">
				<div class="flex items-center justify-between">
					<span class="text-sm text-muted-foreground">{m.admin_overview_pending_review()}</span>
					<AlertTriangle class={`h-4 w-4 ${counts.pluginsPending > 0 ? 'text-warning' : 'text-muted-foreground'}`} />
				</div>
				<div class="text-3xl font-semibold tracking-tight">{loading ? '—' : counts.pluginsPending}</div>
				<div class="text-xs text-muted-foreground">
					{m.admin_overview_pending_rejected({ count: counts.pluginsRejected })}
				</div>
			</CardContent>
		</Card>
	</a>
</div>

<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
	<Card>
		<CardContent class="p-5 space-y-3">
			<div class="flex items-center justify-between">
				<h2 class="text-base font-semibold tracking-tight">{m.admin_overview_recent_activity()}</h2>
				<a href="/admin/plugins" class="text-xs text-primary hover:underline">{m.admin_overview_all_link()}</a>
			</div>
			{#if loading}
				<p class="text-sm text-muted-foreground">{m.common_loading()}</p>
			{:else if recent.length === 0}
				<p class="text-sm text-muted-foreground">{m.admin_overview_no_plugins()}</p>
			{:else}
				<ul class="space-y-1.5 text-sm">
					{#each recent as p (p.id)}
						<li class="flex items-center justify-between gap-3">
							<a href={`/admin/plugins?slug=${p.id}`} class="truncate hover:text-primary">{p.name}</a>
							<div class="flex items-center gap-2 flex-shrink-0">
								<Badge
									variant={p.status === 'approved' ? 'default' : p.status === 'pending' ? 'secondary' : 'destructive'}
									class="text-[10px]">{p.status}</Badge
								>
								<span class="text-xs text-muted-foreground">{relative(p.updatedAt)}</span>
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		</CardContent>
	</Card>

	<Card>
		<CardContent class="p-5 space-y-3">
			<div class="flex items-center justify-between">
				<h2 class="text-base font-semibold tracking-tight">{m.admin_overview_audit_log()}</h2>
				<a href="/admin/audit" class="text-xs text-primary hover:underline">{m.admin_overview_all_link()}</a>
			</div>
			{#if loading}
				<p class="text-sm text-muted-foreground">{m.common_loading()}</p>
			{:else if audit.length === 0}
				<p class="text-sm text-muted-foreground">{m.admin_overview_no_actions()}</p>
			{:else}
				<ul class="space-y-1.5 text-sm">
					{#each audit as e (e.id)}
						<li class="flex items-center justify-between gap-3">
							<div class="truncate">
								<span class="font-mono text-xs text-muted-foreground">{e.action}</span>
								{#if e.target}<span class="text-xs text-muted-foreground"> · {e.target}</span>{/if}
							</div>
							<span class="text-xs text-muted-foreground flex-shrink-0"
								>{e.actorName ?? '—'} · {relative(e.createdAt)}</span
							>
						</li>
					{/each}
				</ul>
			{/if}
		</CardContent>
	</Card>
</div>

{#if health}
	<Card>
		<CardContent class="p-5 space-y-3">
			<div class="flex items-center justify-between">
				<h2 class="text-base font-semibold tracking-tight inline-flex items-center gap-2">
					<Activity class="h-4 w-4" />
					{m.admin_overview_system_health()}
				</h2>
				<Badge variant={health.ok ? 'default' : 'destructive'}
					>{health.ok ? m.admin_overview_health_ok() : m.admin_overview_health_degraded()}</Badge
				>
			</div>
			<div class="text-xs text-muted-foreground">
				{m.admin_overview_uptime({ minutes: Math.floor(health.uptimeSeconds / 60) })}
			</div>
			<div class="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
				{#each Object.entries(health.checks) as [name, check] (name)}
					<div class="rounded-md border border-border bg-card/50 px-3 py-2">
						<div class="flex items-center justify-between">
							<span class="text-xs uppercase tracking-wider text-muted-foreground">{name}</span>
							<Badge variant={check.ok ? 'default' : 'destructive'} class="text-[10px]"
								>{check.ok ? m.admin_overview_check_ok() : m.admin_overview_check_fail()}</Badge
							>
						</div>
						{#if check.detail}<div class="text-[10px] text-muted-foreground mt-1 font-mono">{check.detail}</div>{/if}
					</div>
				{/each}
			</div>
		</CardContent>
	</Card>
{/if}
