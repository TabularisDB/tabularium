<script lang="ts">
	import { onMount } from 'svelte'
	import { Dialog } from 'bits-ui'
	import RefreshCw from '@lucide/svelte/icons/refresh-cw'
	import ExternalLink from '@lucide/svelte/icons/external-link'
	import Button from '$components/ui/Button.svelte'
	import Badge from '$components/ui/Badge.svelte'
	import CodeBlock from '$components/ui/CodeBlock.svelte'
	import { eden } from '$lib/eden'
	import { m } from '$lib/paraglide/messages'

	type WebhookDetails = {
		status: 'configured' | 'missing' | 'misconfigured' | 'unknown'
		reason: string | null
		hooks: { id: number; active: boolean; releaseEvents: boolean; contentType: string | null }[]
		webhookUrl: string
		webhookSecret: string
		provider: string
		settingsUrl: string
		contentType: string
		events: string[]
	}

	let { plugin, onClose }: { plugin: { id: string; name: string; repoUrl: string }; onClose: () => void } = $props()
	let loading = $state(true)
	let details = $state<WebhookDetails | null>(null)
	let error = $state('')
	let revealSecret = $state(false)

	async function load() {
		loading = true
		error = ''
		try {
			const { data, error: apiError } = await eden.api.admin.plugins({ id: plugin.id }).webhook.get()
			if (apiError)
				throw new Error(
					typeof apiError.value === 'string'
						? apiError.value
						: ((apiError.value as { error?: string })?.error ?? m.admin_plugins_webhook_load_failed()),
				)
			details = data as WebhookDetails
		} catch (e) {
			error = e instanceof Error ? e.message : m.admin_plugins_webhook_load_failed()
		} finally {
			loading = false
		}
	}

	onMount(load)
</script>

<Dialog.Root open onOpenChange={(open) => !open && onClose()}>
	<Dialog.Portal>
		<Dialog.Overlay class="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" />
		<Dialog.Content
			class="fixed left-1/2 top-1/2 z-50 w-[calc(100%_-_2rem)] max-w-xl max-h-[90dvh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-border bg-card p-6 shadow-2xl focus:outline-none"
		>
			<Dialog.Title class="text-base font-semibold tracking-tight">
				{m.admin_plugins_webhook_title({ name: plugin.name })}
			</Dialog.Title>
			<Dialog.Description class="mt-1.5 break-all text-sm text-muted-foreground">
				{plugin.repoUrl}
			</Dialog.Description>

			<div class="mt-5 space-y-4" aria-live="polite" aria-busy={loading}>
				{#if loading}
					<p class="text-sm text-muted-foreground">{m.admin_plugins_webhook_checking()}</p>
				{:else if error}
					<p class="text-sm text-destructive" role="alert">{error}</p>
				{:else if details}
					<div class="space-y-2 rounded-md border border-border p-3">
						<Badge variant={details.status === 'configured' ? 'default' : 'secondary'}>
							{#if details.status === 'configured'}
								{m.admin_plugins_webhook_configured()}
							{:else if details.status === 'missing'}
								{m.admin_plugins_webhook_missing()}
							{:else if details.status === 'misconfigured'}
								{m.admin_plugins_webhook_misconfigured()}
							{:else}
								{m.admin_plugins_webhook_unknown()}
							{/if}
						</Badge>
						{#if details.reason}<p class="text-sm text-muted-foreground">{details.reason}</p>{/if}
						{#each details.hooks as hook (hook.id)}
							<div class="text-xs text-muted-foreground">
								<span class="font-mono">#{hook.id}</span> ·
								{hook.active ? m.admin_plugins_webhook_active() : m.admin_plugins_webhook_inactive()} ·
								{hook.releaseEvents
									? m.admin_plugins_webhook_release_enabled()
									: m.admin_plugins_webhook_release_missing()} ·
								{hook.contentType === 'json' ? 'application/json' : m.admin_plugins_webhook_json_missing()}
							</div>
						{/each}
						<p class="text-xs text-muted-foreground">{m.admin_plugins_webhook_secret_check_hint()}</p>
					</div>

					<p class="text-sm text-muted-foreground">
						{m.admin_plugins_webhook_manual_hint({ provider: details.provider })}
					</p>
					<div class="space-y-1.5">
						<div class="text-xs font-medium">{m.submit_webhook_url_label()}</div>
						<CodeBlock value={details.webhookUrl} />
					</div>
					<div class="space-y-1.5">
						<div class="flex items-center justify-between gap-2">
							<span class="text-xs font-medium">{m.submit_webhook_secret_label()}</span>
							<Button variant="ghost" size="sm" onclick={() => (revealSecret = !revealSecret)}>
								{revealSecret ? m.admin_plugins_webhook_hide_secret() : m.admin_plugins_webhook_show_secret()}
							</Button>
						</div>
						{#if revealSecret}
							<CodeBlock value={details.webhookSecret} />
						{:else}
							<div
								class="rounded-md border border-border p-4 font-mono text-xs"
								aria-label={m.admin_plugins_webhook_show_secret()}
							>
								••••••••••••••••
							</div>
						{/if}
					</div>
					<dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
						<dt class="text-muted-foreground">Content type</dt>
						<dd class="font-mono">{details.contentType}</dd>
						<dt class="text-muted-foreground">{m.admin_plugins_webhook_events()}</dt>
						<dd class="font-mono">{details.events.join(', ')}</dd>
						<dt class="text-muted-foreground">{m.admin_plugins_webhook_active()}</dt>
						<dd>{m.admin_plugins_webhook_enabled()}</dd>
					</dl>
					<a
						href={details.settingsUrl}
						target="_blank"
						rel="noopener noreferrer"
						class="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
					>
						{m.admin_plugins_webhook_open_settings({ provider: details.provider })}<ExternalLink class="h-3.5 w-3.5" />
					</a>
				{/if}
			</div>

			<div class="mt-5 grid grid-cols-2 gap-2 sm:flex sm:justify-end">
				<Button
					variant="outline"
					size="sm"
					class="h-11 sm:h-9 tabularis:h-11 sm:tabularis:h-9"
					onclick={load}
					disabled={loading}
				>
					<RefreshCw class="h-3.5 w-3.5" />{m.admin_plugins_webhook_recheck()}
				</Button>
				<Button variant="outline" size="sm" class="h-11 sm:h-9 tabularis:h-11 sm:tabularis:h-9" onclick={onClose}
					>{m.common_close()}</Button
				>
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
