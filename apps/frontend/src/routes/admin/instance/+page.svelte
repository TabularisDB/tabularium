<script lang="ts">
	import { onMount } from 'svelte'
	import { toast } from 'svelte-sonner'
	import Save from '@lucide/svelte/icons/save'
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw'
	import Card from '$components/ui/Card.svelte'
	import CardContent from '$components/ui/CardContent.svelte'
	import CardDescription from '$components/ui/CardDescription.svelte'
	import CardHeader from '$components/ui/CardHeader.svelte'
	import CardTitle from '$components/ui/CardTitle.svelte'
	import Button from '$components/ui/Button.svelte'
	import Label from '$components/ui/Label.svelte'
	import Badge from '$components/ui/Badge.svelte'
	import { eden } from '$lib/eden'

	type RateLimitBucket = {
		id: string
		limit: number
		windowSeconds: number
		defaultLimit: number
		defaultWindowSeconds: number
	}

	type InstanceState = {
		requireApproval: boolean
		rateLimits: RateLimitBucket[]
	}

	let requireApproval = $state(false)
	let rateLimits = $state<RateLimitBucket[]>([])
	let loading = $state(true)
	let saving = $state(false)

	async function load() {
		try {
			const { data, error } = await eden.api.admin.instance.get()
			if (error) throw new Error(typeof error.value === 'string' ? error.value : ((error.value as { error?: string })?.error ?? `Request failed (${error.status})`))
			const res = data as InstanceState
			requireApproval = res.requireApproval
			rateLimits = res.rateLimits
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Failed to load')
		} finally {
			loading = false
		}
	}

	onMount(load)

	async function save() {
		saving = true
		try {
			const { error } = await eden.api.admin.instance.put({
				requireApproval,
				rateLimits: rateLimits.map((r) => ({ id: r.id, limit: r.limit, windowSeconds: r.windowSeconds })),
			})
			if (error) throw new Error(typeof error.value === 'string' ? error.value : ((error.value as { error?: string })?.error ?? `Request failed (${error.status})`))
			toast.success('Saved')
			await load()
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Failed to save')
		} finally {
			saving = false
		}
	}

	async function resetBucket(bucket: RateLimitBucket) {
		try {
			const { error } = await eden.api.admin.instance.put({
				rateLimits: [{ id: bucket.id, limit: bucket.defaultLimit, windowSeconds: bucket.defaultWindowSeconds, reset: true }],
			})
			if (error) throw new Error(typeof error.value === 'string' ? error.value : ((error.value as { error?: string })?.error ?? `Request failed (${error.status})`))
			toast.success(`${bucket.id} reset to default`)
			await load()
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Failed to reset')
		}
	}

	function isOverridden(b: RateLimitBucket) {
		return b.limit !== b.defaultLimit || b.windowSeconds !== b.defaultWindowSeconds
	}
</script>

<header class="space-y-1">
	<h1 class="text-2xl font-semibold tracking-tight">Instance settings</h1>
	<p class="text-sm text-muted-foreground">Approval mode and rate-limit overrides.</p>
</header>

<Card>
	<CardHeader>
		<CardTitle class="text-base flex items-center gap-2">
			Plugin approval
			<Badge variant={requireApproval ? 'default' : 'secondary'}>{requireApproval ? 'on' : 'off'}</Badge>
		</CardTitle>
		<CardDescription>
			When on, new submissions land in <code class="font-mono">pending</code> and webhook ingest returns
			<code class="font-mono">423</code> until you approve in <a href="/admin/plugins" class="text-primary hover:underline">Plugins</a>.
		</CardDescription>
	</CardHeader>
	<CardContent class="space-y-4">
		{#if loading}
			<p class="text-sm text-muted-foreground">Loading…</p>
		{:else}
			<label class="flex items-center gap-3 cursor-pointer select-none">
				<input type="checkbox" bind:checked={requireApproval} class="h-4 w-4 rounded border-input" />
				<span class="text-sm">Require admin approval for new plugins</span>
			</label>
		{/if}
	</CardContent>
</Card>

<Card>
	<CardHeader>
		<CardTitle class="text-base">Rate limits</CardTitle>
		<CardDescription>Per-bucket limit (max requests) within the window (seconds). Subject = authenticated user when present, otherwise client IP.</CardDescription>
	</CardHeader>
	<CardContent class="space-y-3">
		{#if loading}
			<p class="text-sm text-muted-foreground">Loading…</p>
		{:else}
			{#each rateLimits as bucket (bucket.id)}
				<div class="rounded-md border border-border bg-card/50 px-4 py-3 space-y-2">
					<div class="flex items-center gap-2">
						<span class="font-mono text-sm">{bucket.id}</span>
						{#if isOverridden(bucket)}
							<Badge variant="secondary" class="text-[10px]">overridden</Badge>
						{/if}
					</div>
					<div class="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
						<div class="grid gap-1">
							<Label for={`${bucket.id}-limit`} class="text-xs">Limit (default {bucket.defaultLimit})</Label>
							<input
								id={`${bucket.id}-limit`}
								type="number"
								min="1"
								class="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
								bind:value={bucket.limit}
							/>
						</div>
						<div class="grid gap-1">
							<Label for={`${bucket.id}-window`} class="text-xs">Window seconds (default {bucket.defaultWindowSeconds})</Label>
							<input
								id={`${bucket.id}-window`}
								type="number"
								min="1"
								class="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
								bind:value={bucket.windowSeconds}
							/>
						</div>
						<Button variant="ghost" size="sm" onclick={() => resetBucket(bucket)} aria-label="Reset" title="Reset to default">
							<RotateCcw class="h-3.5 w-3.5" />
						</Button>
					</div>
				</div>
			{/each}
		{/if}
	</CardContent>
</Card>

<div class="flex justify-end">
	<Button size="sm" onclick={save} disabled={saving || loading}>
		<Save class="h-3.5 w-3.5" />
		{saving ? 'Saving…' : 'Save'}
	</Button>
</div>
