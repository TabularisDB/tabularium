<script lang="ts">
	import { onMount } from 'svelte'
	import { toast } from 'svelte-sonner'
	import Save from '@lucide/svelte/icons/save'
	import HardDrive from '@lucide/svelte/icons/hard-drive'
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
	import { eden } from '$lib/eden'
	import { m } from '$lib/paraglide/messages'

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
			const { data, error } = await eden.api.admin.infra.cache.get()
			if (error) throw new Error(typeof error.value === 'string' ? error.value : ((error.value as { error?: string })?.error ?? `Request failed (${error.status})`))
			cacheState = data as CacheState
			driver = cacheState.driver
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.admin_infra_cache_load_failed())
		} finally {
			loading = false
		}
	}

	async function loadStorage() {
		try {
			const { data, error } = await eden.api.admin.infra.storage.get()
			if (error) throw new Error(typeof error.value === 'string' ? error.value : ((error.value as { error?: string })?.error ?? `Request failed (${error.status})`))
			storageState = data as StorageState
			storageDriver = storageState.driver
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.admin_infra_storage_load_failed())
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
			const { error } = await eden.api.admin.infra.storage.put(body)
			if (error) throw new Error(typeof error.value === 'string' ? error.value : ((error.value as { error?: string })?.error ?? `Request failed (${error.status})`))
			toast.success(m.admin_infra_storage_reconfigured({ driver: storageDriver }))
			s3AccessKey = ''
			s3SecretKey = ''
			await loadStorage()
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.admin_infra_storage_failed())
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
			const { error } = await eden.api.admin.infra.cache.put(body)
			if (error) throw new Error(typeof error.value === 'string' ? error.value : ((error.value as { error?: string })?.error ?? `Request failed (${error.status})`))
			toast.success(m.admin_infra_cache_reconfigured({ driver }))
			redisUrl = ''
			await load()
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.admin_infra_cache_failed())
		} finally {
			saving = false
		}
	}
</script>

<header class="space-y-1">
	<h1 class="text-2xl font-semibold tracking-tight">{m.admin_infra_title()}</h1>
	<p class="text-sm text-muted-foreground">{m.admin_infra_subtitle()}</p>
</header>

<Card>
	<CardHeader>
		<CardTitle class="text-base">{m.admin_infra_cache()}</CardTitle>
		<CardDescription>
			{@html m.admin_infra_cache_subtitle_html()}
		</CardDescription>
	</CardHeader>
	<CardContent class="space-y-4">
		{#if loading}
			<p class="text-sm text-muted-foreground">{m.common_loading()}</p>
		{:else if cacheState}
			<div class="flex items-center gap-3 text-sm">
				<span class="text-muted-foreground">{m.admin_infra_active()}</span>
				<Badge variant={cacheState.driver === 'redis' ? 'default' : 'secondary'}>{cacheState.driver}</Badge>
				{#if cacheState.configuredDriver === null}
					<span class="text-xs text-muted-foreground">{m.admin_infra_from_env()}</span>
				{/if}
			</div>

			<div class="grid gap-2 max-w-xs">
				<Label for="driver">{m.admin_infra_driver()}</Label>
				<Select id="driver" bind:value={driver}>
					<option value="off">{m.admin_infra_cache_off()}</option>
					<option value="memory">{m.admin_infra_cache_memory()}</option>
					<option value="redis">{m.admin_infra_cache_redis()}</option>
				</Select>
			</div>

			{#if driver === 'redis'}
				<div class="grid gap-2 max-w-md">
					<Label for="redis-url">{m.admin_infra_redis_url()}</Label>
					<Input
						id="redis-url"
						type="password"
						placeholder={cacheState.redisUrlConfigured
							? cacheState.redisUrlMasked ?? 'redis://… (configured)'
							: 'redis://user:pass@host:6379'}
						bind:value={redisUrl}
					/>
					<p class="text-xs text-muted-foreground">
						{m.admin_infra_redis_url_note()}
					</p>
				</div>
			{/if}

			<div class="flex justify-end">
				<Button size="sm" onclick={save} disabled={saving}>
					<Save class="h-3.5 w-3.5" />
					{saving ? m.common_saving() : m.common_apply()}
				</Button>
			</div>
		{/if}
	</CardContent>
</Card>

<Card>
	<CardHeader>
		<CardTitle class="text-base flex items-center gap-2">
			<HardDrive class="h-4 w-4" />
			{m.admin_infra_storage()}
		</CardTitle>
		<CardDescription>
			{@html m.admin_infra_storage_subtitle_html()}
		</CardDescription>
	</CardHeader>
	<CardContent class="space-y-4">
		{#if storageLoading}
			<p class="text-sm text-muted-foreground">{m.common_loading()}</p>
		{:else if storageState}
			<div class="flex items-center gap-3 text-sm">
				<span class="text-muted-foreground">{m.admin_infra_active()}</span>
				<Badge variant={storageState.driver === 's3' ? 'default' : 'secondary'}>{storageState.driver}</Badge>
			</div>

			<div class="grid gap-2 max-w-xs">
				<Label for="storage-driver">{m.admin_infra_driver()}</Label>
				<Select id="storage-driver" bind:value={storageDriver}>
					<option value="off">{m.admin_infra_storage_off()}</option>
					<option value="disk">{m.admin_infra_storage_disk()}</option>
					<option value="s3">{m.admin_infra_storage_s3()}</option>
				</Select>
			</div>

			{#if storageDriver === 's3'}
				<div class="grid gap-2 max-w-md">
					<Label for="s3-bucket">{m.admin_infra_s3_bucket()}</Label>
					<Input id="s3-bucket" bind:value={s3Bucket} placeholder={storageState.s3.bucket ?? 'my-bucket'} />
				</div>
				<div class="grid grid-cols-2 gap-3 max-w-md">
					<div class="grid gap-2">
						<Label for="s3-region">{m.admin_infra_s3_region()}</Label>
						<Input id="s3-region" bind:value={s3Region} placeholder={storageState.s3.region ?? 'us-east-1'} />
					</div>
					<div class="grid gap-2">
						<Label for="s3-endpoint">{m.admin_infra_s3_endpoint()}</Label>
						<Input id="s3-endpoint" bind:value={s3Endpoint} placeholder={storageState.s3.endpoint ?? 'auto'} />
					</div>
				</div>
				<div class="grid gap-2 max-w-md">
					<Label for="s3-base">{m.admin_infra_s3_public_base()}</Label>
					<Input id="s3-base" bind:value={s3PublicBase} placeholder={storageState.s3.publicBaseUrl ?? 'https://cdn.example.com'} />
				</div>
				<div class="grid grid-cols-2 gap-3 max-w-md">
					<div class="grid gap-2">
						<Label for="s3-ak">{m.admin_infra_s3_access_key()}</Label>
						<Input id="s3-ak" type="password" bind:value={s3AccessKey} placeholder={storageState.s3.accessKeyConfigured ? '••••' : 'AKIA…'} />
					</div>
					<div class="grid gap-2">
						<Label for="s3-sk">{m.admin_infra_s3_secret_key()}</Label>
						<Input id="s3-sk" type="password" bind:value={s3SecretKey} placeholder={storageState.s3.secretKeyConfigured ? '••••' : ''} />
					</div>
				</div>
			{/if}

			<div class="flex justify-end">
				<Button size="sm" onclick={saveStorage} disabled={storageSaving}>
					<Save class="h-3.5 w-3.5" />
					{storageSaving ? m.common_saving() : m.common_apply()}
				</Button>
			</div>
		{/if}
	</CardContent>
</Card>
