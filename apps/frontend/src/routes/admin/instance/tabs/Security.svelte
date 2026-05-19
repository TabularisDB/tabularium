<script lang="ts">
	import { onMount } from 'svelte'
	import { toast } from 'svelte-sonner'
	import RefreshCw from '@lucide/svelte/icons/refresh-cw'
	import Play from '@lucide/svelte/icons/play'
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

	type PublicJwk = {
		kty: 'OKP'
		crv: 'Ed25519'
		x: string
		use: 'sig'
		alg: 'EdDSA'
		kid: string
		created_at?: number
		rotated_at?: number
	}

	const MB = 1024 * 1024
	const GIB = 1024 * 1024 * 1024
	const MAX_BUDGET_BYTES = 16 * GIB
	const DEFAULT_BUDGET_BYTES = 500 * MB

	let loading = $state(true)
	let saving = $state(false)
	let rotating = $state(false)
	let backfilling = $state(false)

	let current = $state<PublicJwk | null>(null)
	let previous = $state<PublicJwk | null>(null)

	let budgetMb = $state<number>(Math.round(DEFAULT_BUDGET_BYTES / MB))
	let initialBudgetMb = $state<number>(Math.round(DEFAULT_BUDGET_BYTES / MB))

	const dirty = $derived(Number.isFinite(budgetMb) && budgetMb > 0 && budgetMb !== initialBudgetMb)

	function extractError(error: unknown): string {
		const e = error as { value?: unknown; status?: number }
		if (typeof e.value === 'string') return e.value
		const v = e.value as { error?: string } | undefined
		return v?.error ?? `Request failed (${e.status ?? '?'})`
	}

	function formatBytes(n: number): string {
		if (!Number.isFinite(n) || n <= 0) return '—'
		if (n >= GIB) {
			const v = n / GIB
			return `${Number.isInteger(v) ? v : v.toFixed(2)} GB`
		}
		if (n >= MB) {
			const v = n / MB
			return `${Number.isInteger(v) ? v : v.toFixed(2)} MB`
		}
		if (n >= 1024) {
			const v = n / 1024
			return `${Number.isInteger(v) ? v : v.toFixed(2)} KB`
		}
		return `${n} B`
	}

	function formatTimestamp(unixSeconds?: number): string {
		if (!unixSeconds || !Number.isFinite(unixSeconds)) return '—'
		return new Date(unixSeconds * 1000).toLocaleString()
	}

	async function loadInstance() {
		const { data, error } = await eden.api.admin.instance.get()
		if (error) throw new Error(extractError(error))
		const res = data as { assetSizeCapBytes: number }
		const bytes =
			Number.isFinite(res.assetSizeCapBytes) && res.assetSizeCapBytes > 0 ? res.assetSizeCapBytes : DEFAULT_BUDGET_BYTES
		const mb = Math.max(1, Math.round(bytes / MB))
		budgetMb = mb
		initialBudgetMb = mb
	}

	async function loadKeys() {
		const { data, error } = await eden.api.admin.instance.security.get()
		if (error) throw new Error(extractError(error))
		const res = data as { current: PublicJwk; previous: PublicJwk | null }
		current = res.current
		previous = res.previous
	}

	async function load() {
		loading = true
		try {
			await Promise.all([loadInstance(), loadKeys()])
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.admin_security_load_failed())
		} finally {
			loading = false
		}
	}

	async function saveBudget() {
		if (!Number.isFinite(budgetMb) || budgetMb <= 0) {
			toast.error(m.admin_security_budget_save_failed())
			return
		}
		const bytes = Math.round(budgetMb * MB)
		if (bytes > MAX_BUDGET_BYTES) {
			toast.error(m.admin_security_budget_save_failed())
			return
		}
		saving = true
		try {
			const { error } = await eden.api.admin.instance.put({ assetSizeCapBytes: bytes })
			if (error) throw new Error(extractError(error))
			toast.success(m.admin_security_budget_saved())
			initialBudgetMb = budgetMb
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.admin_security_budget_save_failed())
		} finally {
			saving = false
		}
	}

	function discardBudget() {
		budgetMb = initialBudgetMb
	}

	async function rotateKey() {
		if (!confirm(m.admin_security_rotate_confirm())) return
		rotating = true
		try {
			const { error } = await eden.api.admin.instance.security.rotate.post()
			if (error) throw new Error(extractError(error))
			toast.success(m.admin_security_rotate_success())
			await loadKeys()
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.admin_security_rotate_failed())
		} finally {
			rotating = false
		}
	}

	async function runBackfill() {
		backfilling = true
		try {
			const { error } = await eden.api.admin.instance.security.backfill.post()
			if (error) throw new Error(extractError(error))
			toast.success(m.admin_security_backfill_started())
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.admin_security_backfill_failed())
		} finally {
			backfilling = false
		}
	}

	onMount(load)
</script>

<div class="space-y-6">
	<Card>
		<CardHeader>
			<CardTitle class="text-base flex items-center gap-2">
				{m.admin_security_key_card_title()}
				{#if current}
					<Badge variant="default">active</Badge>
				{/if}
			</CardTitle>
			<CardDescription>{m.admin_security_key_card_subtitle()}</CardDescription>
		</CardHeader>
		<CardContent class="space-y-4">
			{#if loading}
				<p class="text-sm text-muted-foreground">{m.common_loading()}</p>
			{:else if current}
				<div class="rounded-md border border-border bg-card/50 p-3 space-y-2">
					<div class="grid gap-1 text-sm sm:grid-cols-[120px_1fr] sm:gap-x-3">
						<span class="text-muted-foreground">{m.admin_security_key_kid()}</span>
						<code class="font-mono break-all">{current.kid}</code>
						<span class="text-muted-foreground">{m.admin_security_key_created()}</span>
						<span>{formatTimestamp(current.created_at)}</span>
					</div>
				</div>

				{#if previous}
					<div class="rounded-md border border-border bg-card/30 p-3 space-y-2">
						<div class="flex items-center gap-2">
							<span class="text-sm font-medium">{m.admin_security_key_previous_title()}</span>
							<Badge variant="secondary">verify-only</Badge>
						</div>
						<div class="grid gap-1 text-sm sm:grid-cols-[120px_1fr] sm:gap-x-3">
							<span class="text-muted-foreground">{m.admin_security_key_kid()}</span>
							<code class="font-mono break-all">{previous.kid}</code>
							<span class="text-muted-foreground">{m.admin_security_key_previous_rotated()}</span>
							<span>{formatTimestamp(previous.rotated_at)}</span>
						</div>
					</div>
				{/if}

				<div class="flex justify-end">
					<Button size="sm" variant="outline" onclick={rotateKey} disabled={rotating}>
						<RefreshCw class="h-3.5 w-3.5 {rotating ? 'animate-spin' : ''}" />
						{m.admin_security_rotate_button()}
					</Button>
				</div>
			{/if}
		</CardContent>
	</Card>

	<Card>
		<CardHeader>
			<CardTitle class="text-base">{m.admin_security_budget_card_title()}</CardTitle>
			<CardDescription>{m.admin_security_budget_card_subtitle()}</CardDescription>
		</CardHeader>
		<CardContent class="space-y-4">
			{#if loading}
				<p class="text-sm text-muted-foreground">{m.common_loading()}</p>
			{:else}
				<div class="grid gap-2 max-w-xs">
					<Label for="assetBudgetMb">{m.admin_security_budget_label()}</Label>
					<input
						id="assetBudgetMb"
						type="number"
						min="1"
						max={MAX_BUDGET_BYTES / MB}
						step="1"
						class="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
						bind:value={budgetMb}
					/>
					<p class="text-xs text-muted-foreground">{m.admin_security_budget_hint()}</p>
					<p class="text-xs text-muted-foreground">
						Effective: <code class="font-mono">{formatBytes(initialBudgetMb * MB)}</code>
					</p>
				</div>
			{/if}
		</CardContent>
	</Card>

	<Card>
		<CardHeader>
			<CardTitle class="text-base">{m.admin_security_backfill_card_title()}</CardTitle>
			<CardDescription>{m.admin_security_backfill_card_subtitle()}</CardDescription>
		</CardHeader>
		<CardContent>
			<div class="flex justify-end">
				<Button size="sm" variant="outline" onclick={runBackfill} disabled={backfilling}>
					<Play class="h-3.5 w-3.5" />
					{m.admin_security_backfill_button()}
				</Button>
			</div>
		</CardContent>
	</Card>
</div>

<StickySaveBar {dirty} {saving} onSave={saveBudget} onDiscard={discardBudget} />
