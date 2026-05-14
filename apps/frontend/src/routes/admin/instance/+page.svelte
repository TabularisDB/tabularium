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
	import Input from '$components/ui/Input.svelte'
	import Label from '$components/ui/Label.svelte'
	import Badge from '$components/ui/Badge.svelte'
	import { eden } from '$lib/eden'
	import { m } from '$lib/paraglide/messages'

	type RateLimitBucket = {
		id: string
		limit: number
		windowSeconds: number
		defaultLimit: number
		defaultWindowSeconds: number
	}

	type ManifestState = {
		filename: string
		schemaUrl: string
		filenameOverridden: boolean
		schemaUrlOverridden: boolean
	}

	type InstanceState = {
		requireApproval: boolean
		rateLimits: RateLimitBucket[]
		manifest: ManifestState
	}

	let requireApproval = $state(false)
	let rateLimits = $state<RateLimitBucket[]>([])
	let manifestFilename = $state('')
	let manifestSchemaUrl = $state('')
	let manifestDefaults = $state<{ filename: string; schemaUrl: string }>({ filename: 'tabularium', schemaUrl: '' })
	let loading = $state(true)
	let saving = $state(false)
	let savingManifest = $state(false)

	async function load() {
		try {
			const { data, error } = await eden.api.admin.instance.get()
			if (error) throw new Error(typeof error.value === 'string' ? error.value : ((error.value as { error?: string })?.error ?? `Request failed (${error.status})`))
			const res = data as InstanceState
			requireApproval = res.requireApproval
			rateLimits = res.rateLimits
			manifestFilename = res.manifest.filenameOverridden ? res.manifest.filename : ''
			manifestSchemaUrl = res.manifest.schemaUrlOverridden ? res.manifest.schemaUrl : ''
			manifestDefaults = { filename: res.manifest.filename, schemaUrl: res.manifest.schemaUrl }
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.admin_instance_load_failed())
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
			toast.success(m.admin_instance_saved())
			await load()
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.admin_instance_save_failed())
		} finally {
			saving = false
		}
	}

	async function saveManifest() {
		savingManifest = true
		try {
			const { error } = await eden.api.admin.instance.put({
				manifestFilename: manifestFilename.trim() ? manifestFilename.trim() : null,
				manifestSchemaUrl: manifestSchemaUrl.trim() ? manifestSchemaUrl.trim() : null,
			})
			if (error) throw new Error(typeof error.value === 'string' ? error.value : ((error.value as { error?: string })?.error ?? `Request failed (${error.status})`))
			toast.success(m.admin_manifest_saved())
			await load()
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.admin_manifest_save_failed())
		} finally {
			savingManifest = false
		}
	}

	async function resetBucket(bucket: RateLimitBucket) {
		try {
			const { error } = await eden.api.admin.instance.put({
				rateLimits: [{ id: bucket.id, limit: bucket.defaultLimit, windowSeconds: bucket.defaultWindowSeconds, reset: true }],
			})
			if (error) throw new Error(typeof error.value === 'string' ? error.value : ((error.value as { error?: string })?.error ?? `Request failed (${error.status})`))
			toast.success(m.admin_instance_reset_to_default({ id: bucket.id }))
			await load()
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.admin_instance_reset_failed())
		}
	}

	function isOverridden(b: RateLimitBucket) {
		return b.limit !== b.defaultLimit || b.windowSeconds !== b.defaultWindowSeconds
	}
</script>

<header class="space-y-1">
	<h1 class="text-2xl font-semibold tracking-tight">{m.admin_instance_title()}</h1>
	<p class="text-sm text-muted-foreground">{m.admin_instance_subtitle()}</p>
</header>

<Card>
	<CardHeader>
		<CardTitle class="text-base flex items-center gap-2">
			{m.admin_instance_approval_title()}
			<Badge variant={requireApproval ? 'default' : 'secondary'}>{requireApproval ? m.admin_instance_approval_on() : m.admin_instance_approval_off()}</Badge>
		</CardTitle>
		<CardDescription>
			{m.admin_instance_approval_subtitle_prefix()} <code class="font-mono">pending</code> {m.admin_instance_approval_subtitle_middle()}
			<code class="font-mono">423</code> {m.admin_instance_approval_subtitle_suffix()} <a href="/admin/plugins" class="text-primary hover:underline">{m.admin_instance_plugins_link()}</a>.
		</CardDescription>
	</CardHeader>
	<CardContent class="space-y-4">
		{#if loading}
			<p class="text-sm text-muted-foreground">{m.common_loading()}</p>
		{:else}
			<label class="flex items-center gap-3 cursor-pointer select-none">
				<input type="checkbox" bind:checked={requireApproval} class="h-4 w-4 rounded border-input" />
				<span class="text-sm">{m.admin_instance_require_approval()}</span>
			</label>
		{/if}
	</CardContent>
</Card>

<Card>
	<CardHeader>
		<CardTitle class="text-base">{m.admin_instance_rate_limits()}</CardTitle>
		<CardDescription>{m.admin_instance_rate_limits_subtitle()}</CardDescription>
	</CardHeader>
	<CardContent class="space-y-3">
		{#if loading}
			<p class="text-sm text-muted-foreground">{m.common_loading()}</p>
		{:else}
			{#each rateLimits as bucket (bucket.id)}
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

<div class="flex justify-end">
	<Button size="sm" onclick={save} disabled={saving || loading}>
		<Save class="h-3.5 w-3.5" />
		{saving ? m.common_saving() : m.common_save()}
	</Button>
</div>

<Card>
	<CardHeader>
		<CardTitle class="text-base">{m.admin_manifest_card_title()}</CardTitle>
		<CardDescription>{m.admin_manifest_card_subtitle()}</CardDescription>
	</CardHeader>
	<CardContent class="space-y-4">
		{#if loading}
			<p class="text-sm text-muted-foreground">{m.common_loading()}</p>
		{:else}
			<div class="grid gap-2 max-w-md">
				<Label for="manifestFilename">{m.admin_manifest_filename()}</Label>
				<Input id="manifestFilename" bind:value={manifestFilename} maxlength={40} placeholder={manifestDefaults.filename} />
				<p class="text-xs text-muted-foreground">{m.admin_manifest_filename_hint()}</p>
			</div>
			<div class="grid gap-2 max-w-md">
				<Label for="manifestSchemaUrl">{m.admin_manifest_schema_url()}</Label>
				<Input id="manifestSchemaUrl" bind:value={manifestSchemaUrl} maxlength={500} placeholder={manifestDefaults.schemaUrl} />
				<p class="text-xs text-muted-foreground">{m.admin_manifest_schema_url_hint()}</p>
			</div>
			<div class="flex justify-end">
				<Button size="sm" onclick={saveManifest} disabled={savingManifest}>
					<Save class="h-3.5 w-3.5" />
					{savingManifest ? m.common_saving() : m.common_save()}
				</Button>
			</div>
		{/if}
	</CardContent>
</Card>
