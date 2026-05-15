<script lang="ts">
	import { onMount } from 'svelte'
	import { toast } from 'svelte-sonner'
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw'
	import Card from '$components/ui/Card.svelte'
	import CardContent from '$components/ui/CardContent.svelte'
	import CardDescription from '$components/ui/CardDescription.svelte'
	import CardHeader from '$components/ui/CardHeader.svelte'
	import CardTitle from '$components/ui/CardTitle.svelte'
	import Button from '$components/ui/Button.svelte'
	import Label from '$components/ui/Label.svelte'
	import Badge from '$components/ui/Badge.svelte'
	import StickySaveBar from '$components/admin/StickySaveBar.svelte'
	import { eden } from '$lib/eden'
	import { m } from '$lib/paraglide/messages'

	type Bucket = {
		id: string
		limit: number
		windowSeconds: number
		defaultLimit: number
		defaultWindowSeconds: number
	}

	let buckets = $state<Bucket[]>([])
	let initial = $state('')
	let loading = $state(true)
	let saving = $state(false)

	const dirty = $derived(JSON.stringify(buckets.map((b) => [b.id, b.limit, b.windowSeconds])) !== initial)

	function extractError(error: unknown): string {
		const e = error as { value?: unknown; status?: number }
		if (typeof e.value === 'string') return e.value
		const v = e.value as { error?: string } | undefined
		return v?.error ?? `Request failed (${e.status ?? '?'})`
	}

	async function load() {
		try {
			const { data, error } = await eden.api.admin.instance.get()
			if (error) throw new Error(extractError(error))
			const res = data as { rateLimits: Bucket[] }
			buckets = res.rateLimits
			initial = JSON.stringify(buckets.map((b) => [b.id, b.limit, b.windowSeconds]))
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.admin_instance_load_failed())
		} finally {
			loading = false
		}
	}

	async function save() {
		saving = true
		try {
			const { error } = await eden.api.admin.instance.put({
				rateLimits: buckets.map((b) => ({ id: b.id, limit: b.limit, windowSeconds: b.windowSeconds })),
			})
			if (error) throw new Error(extractError(error))
			toast.success(m.admin_instance_saved())
			await load()
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.admin_instance_save_failed())
		} finally {
			saving = false
		}
	}

	async function resetBucket(bucket: Bucket) {
		try {
			const { error } = await eden.api.admin.instance.put({
				rateLimits: [
					{
						id: bucket.id,
						limit: bucket.defaultLimit,
						windowSeconds: bucket.defaultWindowSeconds,
						reset: true,
					},
				],
			})
			if (error) throw new Error(extractError(error))
			toast.success(m.admin_instance_reset_to_default({ id: bucket.id }))
			await load()
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.admin_instance_reset_failed())
		}
	}

	function discard() {
		load()
	}

	function isOverridden(b: Bucket) {
		return b.limit !== b.defaultLimit || b.windowSeconds !== b.defaultWindowSeconds
	}

	function onKey(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
			e.preventDefault()
			if (dirty) save()
		}
	}

	onMount(load)
</script>

<div class="space-y-6" onkeydown={onKey} role="presentation">
	<Card>
		<CardHeader>
			<CardTitle class="text-base">{m.admin_instance_rate_limits()}</CardTitle>
			<CardDescription>{m.admin_instance_rate_limits_subtitle()}</CardDescription>
		</CardHeader>
		<CardContent class="space-y-3">
			{#if loading}
				<p class="text-sm text-muted-foreground">{m.common_loading()}</p>
			{:else}
				{#each buckets as bucket (bucket.id)}
					<div class="rounded-md border border-border bg-card/50 px-4 py-3 space-y-2">
						<div class="flex items-center gap-2">
							<span class="font-mono text-sm">{bucket.id}</span>
							{#if isOverridden(bucket)}
								<Badge variant="secondary" class="text-[10px]">{m.admin_instance_overridden()}</Badge>
							{/if}
						</div>
						<div class="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
							<div class="grid gap-1">
								<Label for={`${bucket.id}-limit`} class="text-xs">{m.admin_instance_limit_label({ value: bucket.defaultLimit })}</Label>
								<input
									id={`${bucket.id}-limit`}
									type="number"
									min="1"
									class="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
									bind:value={bucket.limit}
								/>
							</div>
							<div class="grid gap-1">
								<Label for={`${bucket.id}-window`} class="text-xs">{m.admin_instance_window_label({ value: bucket.defaultWindowSeconds })}</Label>
								<input
									id={`${bucket.id}-window`}
									type="number"
									min="1"
									class="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
									bind:value={bucket.windowSeconds}
								/>
							</div>
							<Button variant="ghost" size="sm" onclick={() => resetBucket(bucket)} aria-label={m.common_reset()} title={m.common_reset()}>
								<RotateCcw class="h-3.5 w-3.5" />
							</Button>
						</div>
					</div>
				{/each}
			{/if}
		</CardContent>
	</Card>
</div>

<StickySaveBar {dirty} {saving} onSave={save} onDiscard={discard} />
