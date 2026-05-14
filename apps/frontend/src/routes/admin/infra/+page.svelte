<script lang="ts">
	import { onMount } from 'svelte'
	import { toast } from 'svelte-sonner'
	import Save from '@lucide/svelte/icons/save'
	import Database from '@lucide/svelte/icons/database'
	import HardDrive from '@lucide/svelte/icons/hard-drive'
	import Cloud from '@lucide/svelte/icons/cloud'
	import Card from '$components/ui/Card.svelte'
	import CardContent from '$components/ui/CardContent.svelte'
	import CardDescription from '$components/ui/CardDescription.svelte'
	import CardHeader from '$components/ui/CardHeader.svelte'
	import CardTitle from '$components/ui/CardTitle.svelte'
	import Button from '$components/ui/Button.svelte'
	import Input from '$components/ui/Input.svelte'
	import Label from '$components/ui/Label.svelte'
	import Select from '$components/ui/Select.svelte'
	import Badge from '$components/ui/Badge.svelte'
	import { api } from '$lib/api'

	type CacheState = {
		driver: 'off' | 'memory' | 'redis'
		configuredDriver: string | null
		defaultDriver: 'off' | 'memory' | 'redis'
		redisUrlConfigured: boolean
		redisUrlMasked: string | null
	}

	type StorageState = {
		driver: 'off' | 'disk' | 's3'
		configuredDriver: string | null
		s3: {
			bucket: string | null
			region: string | null
			endpoint: string | null
			publicBaseUrl: string | null
			accessKeyConfigured: boolean
			secretKeyConfigured: boolean
		}
	}

	let cacheState = $state<CacheState | null>(null)
	let driver = $state<'off' | 'memory' | 'redis'>('memory')
	let redisUrl = $state('')
	let saving = $state(false)
	let loading = $state(true)

	let storageState = $state<StorageState | null>(null)
	let storageDriver = $state<'off' | 'disk' | 's3'>('disk')
	let s3Bucket = $state('')
	let s3Region = $state('')
	let s3Endpoint = $state('')
	let s3PublicBase = $state('')
	let s3AccessKey = $state('')
	let s3SecretKey = $state('')
	let storageSaving = $state(false)
	let storageLoading = $state(true)

	async function load() {
		try {
			cacheState = await api.get<CacheState>('/api/admin/infra/cache')
			driver = cacheState.driver
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Failed to load cache state')
		} finally {
			loading = false
		}
	}

	async function loadStorage() {
		try {
			storageState = await api.get<StorageState>('/api/admin/infra/storage')
			storageDriver = storageState.driver
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Failed to load storage state')
		} finally {
			storageLoading = false
		}
	}

	async function saveStorage() {
		storageSaving = true
		try {
			const body: { driver: typeof storageDriver; s3?: Record<string, string> } = { driver: storageDriver }
			if (storageDriver === 's3') {
				const s3: Record<string, string> = {}
				if (s3Bucket) s3.bucket = s3Bucket
				if (s3Region) s3.region = s3Region
				if (s3Endpoint) s3.endpoint = s3Endpoint
				if (s3PublicBase) s3.publicBaseUrl = s3PublicBase
				if (s3AccessKey) s3.accessKey = s3AccessKey
				if (s3SecretKey) s3.secretKey = s3SecretKey
				if (Object.keys(s3).length) body.s3 = s3
			}
			await api.put('/api/admin/infra/storage', body)
			toast.success(`Storage reconfigured to ${storageDriver}`)
			s3AccessKey = ''
			s3SecretKey = ''
			await loadStorage()
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Failed to update storage')
		} finally {
			storageSaving = false
		}
	}

	onMount(() => {
		load()
		loadStorage()
	})

	async function save() {
		saving = true
		try {
			const body: { driver: typeof driver; redisUrl?: string } = { driver }
			if (driver === 'redis' && redisUrl.trim()) body.redisUrl = redisUrl.trim()
			await api.put('/api/admin/infra/cache', body)
			toast.success(`Cache reconfigured to ${driver}`)
			redisUrl = ''
			await load()
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Failed to update cache')
		} finally {
			saving = false
		}
	}
</script>

<header class="space-y-1">
	<h1 class="text-2xl font-semibold tracking-tight">Infrastructure</h1>
	<p class="text-sm text-muted-foreground">Hot-swap cache, queue, storage and mail backends without a restart.</p>
</header>

<Card>
	<CardHeader>
		<CardTitle class="text-base">Cache</CardTitle>
		<CardDescription>
			Used for the <code class="font-mono">/api/plugins/:slug/latest</code> read cache, rate-limit counters, and short-lived
			OAuth cacheState. <b>off</b> disables read-caching and breaks rate-limits — only safe in tests. <b>memory</b> is the right
			default for single-node deploys. <b>redis</b> is required for multi-node.
		</CardDescription>
	</CardHeader>
	<CardContent class="space-y-4">
		{#if loading}
			<p class="text-sm text-muted-foreground">Loading…</p>
		{:else if cacheState}
			<div class="flex items-center gap-3 text-sm">
				<span class="text-muted-foreground">Active:</span>
				<Badge variant={cacheState.driver === 'redis' ? 'default' : 'secondary'}>{cacheState.driver}</Badge>
				{#if cacheState.configuredDriver === null}
					<span class="text-xs text-muted-foreground">(from <code class="font-mono">.env</code> default)</span>
				{/if}
			</div>

			<div class="grid gap-2 max-w-xs">
				<Label for="driver">Driver</Label>
				<Select id="driver" bind:value={driver}>
					<option value="off">off — no cache, no rate limit</option>
					<option value="memory">memory — single-node (default)</option>
					<option value="redis">redis — multi-node / persistent</option>
				</Select>
			</div>

			{#if driver === 'redis'}
				<div class="grid gap-2 max-w-md">
					<Label for="redis-url">Redis URL</Label>
					<Input
						id="redis-url"
						type="password"
						placeholder={cacheState.redisUrlConfigured
							? cacheState.redisUrlMasked ?? 'redis://… (configured)'
							: 'redis://user:pass@host:6379'}
						bind:value={redisUrl}
					/>
					<p class="text-xs text-muted-foreground">
						Stored encrypted. Leave blank to reuse the currently configured URL. Works with Dragonfly too — same protocol.
					</p>
				</div>
			{/if}

			<div class="flex justify-end">
				<Button size="sm" onclick={save} disabled={saving}>
					<Save class="h-3.5 w-3.5" />
					{saving ? 'Saving…' : 'Apply'}
				</Button>
			</div>
		{/if}
	</CardContent>
</Card>

<Card>
	<CardHeader>
		<CardTitle class="text-base flex items-center gap-2">
			<Database class="h-4 w-4" />
			Database <Badge variant="secondary" class="ml-1">planned</Badge>
		</CardTitle>
		<CardDescription>
			Configurable in the setup wizard, applied on restart — schema migrations make hot-swap unsafe.
		</CardDescription>
	</CardHeader>
</Card>

<Card>
	<CardHeader>
		<CardTitle class="text-base flex items-center gap-2">
			<HardDrive class="h-4 w-4" />
			Object storage
		</CardTitle>
		<CardDescription>
			Where uploaded files live (provider logos today; asset mirroring later). <b>disk</b> writes under
			<code class="font-mono">data/uploads/</code> and serves via <code class="font-mono">/uploads/</code>. <b>s3</b> via
			<code class="font-mono">Bun.S3Client</code> — works with AWS, MinIO, R2.
		</CardDescription>
	</CardHeader>
	<CardContent class="space-y-4">
		{#if storageLoading}
			<p class="text-sm text-muted-foreground">Loading…</p>
		{:else if storageState}
			<div class="flex items-center gap-3 text-sm">
				<span class="text-muted-foreground">Active:</span>
				<Badge variant={storageState.driver === 's3' ? 'default' : 'secondary'}>{storageState.driver}</Badge>
			</div>

			<div class="grid gap-2 max-w-xs">
				<Label for="storage-driver">Driver</Label>
				<Select id="storage-driver" bind:value={storageDriver}>
					<option value="off">off — uploads disabled</option>
					<option value="disk">disk — local data/uploads</option>
					<option value="s3">s3 — AWS / MinIO / R2</option>
				</Select>
			</div>

			{#if storageDriver === 's3'}
				<div class="grid gap-2 max-w-md">
					<Label for="s3-bucket">Bucket</Label>
					<Input id="s3-bucket" bind:value={s3Bucket} placeholder={storageState.s3.bucket ?? 'my-bucket'} />
				</div>
				<div class="grid grid-cols-2 gap-3 max-w-md">
					<div class="grid gap-2">
						<Label for="s3-region">Region</Label>
						<Input id="s3-region" bind:value={s3Region} placeholder={storageState.s3.region ?? 'us-east-1'} />
					</div>
					<div class="grid gap-2">
						<Label for="s3-endpoint">Endpoint (optional)</Label>
						<Input id="s3-endpoint" bind:value={s3Endpoint} placeholder={storageState.s3.endpoint ?? 'auto'} />
					</div>
				</div>
				<div class="grid gap-2 max-w-md">
					<Label for="s3-base">Public base URL (optional)</Label>
					<Input id="s3-base" bind:value={s3PublicBase} placeholder={storageState.s3.publicBaseUrl ?? 'https://cdn.example.com'} />
				</div>
				<div class="grid grid-cols-2 gap-3 max-w-md">
					<div class="grid gap-2">
						<Label for="s3-ak">Access key</Label>
						<Input id="s3-ak" type="password" bind:value={s3AccessKey} placeholder={storageState.s3.accessKeyConfigured ? '••••' : 'AKIA…'} />
					</div>
					<div class="grid gap-2">
						<Label for="s3-sk">Secret key</Label>
						<Input id="s3-sk" type="password" bind:value={s3SecretKey} placeholder={storageState.s3.secretKeyConfigured ? '••••' : ''} />
					</div>
				</div>
			{/if}

			<div class="flex justify-end">
				<Button size="sm" onclick={saveStorage} disabled={storageSaving}>
					<Save class="h-3.5 w-3.5" />
					{storageSaving ? 'Saving…' : 'Apply'}
				</Button>
			</div>
		{/if}
	</CardContent>
</Card>
