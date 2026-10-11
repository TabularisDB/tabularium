<script lang="ts">
	import { toast } from 'svelte-sonner'
	import Plus from '@lucide/svelte/icons/plus'
	import Trash2 from '@lucide/svelte/icons/trash-2'
	import Save from '@lucide/svelte/icons/save'
	import Eye from '@lucide/svelte/icons/eye'
	import BookOpen from '@lucide/svelte/icons/book-open'
	import Lock from '@lucide/svelte/icons/lock'
	import Card from '$components/ui/Card.svelte'
	import CardContent from '$components/ui/CardContent.svelte'
	import CardHeader from '$components/ui/CardHeader.svelte'
	import CardTitle from '$components/ui/CardTitle.svelte'
	import Button from '$components/ui/Button.svelte'
	import Input from '$components/ui/Input.svelte'
	import Label from '$components/ui/Label.svelte'
	import Select from '$components/ui/Select.svelte'
	import Textarea from '$components/ui/Textarea.svelte'
	import { cn } from '$lib/utils'
	import { m } from '$lib/paraglide/messages'
	import {
		api,
		prettyBody,
		type HeaderRow,
		type RenderedRequest,
		type WebhookMeta,
		type WebhookPreset,
		type WebhookView,
	} from './types'

	type Props = {
		webhook: WebhookView | null
		meta: WebhookMeta
		onSaved: (webhook: WebhookView) => void
		onCancel: () => void
	}
	let { webhook, meta, onSaved, onCancel }: Props = $props()

	// `stored` rows already have a value server-side; an empty value keeps it.
	type SecretRow = { name: string; value: string; stored: boolean; remove: boolean }

	const METHODS = ['POST', 'PUT', 'PATCH', 'GET', 'DELETE']
	const SECRET_NAME = /^[A-Z][A-Z0-9_]{0,63}$/

	// svelte-ignore state_referenced_locally
	const initial = webhook
	let preset = $state<string | null>(initial?.preset ?? null)
	let name = $state(initial?.name ?? '')
	let enabled = $state(initial?.enabled ?? true)
	let events = $state<string[]>(initial?.events ?? ['plugin.submitted', 'plugin.approved', 'plugin.rejected'])
	let method = $state(initial?.method ?? 'POST')
	let url = $state(initial?.url ?? '')
	let contentType = $state(initial?.contentType ?? 'application/json')
	let headers = $state<HeaderRow[]>(initial?.headers.map((h) => ({ ...h })) ?? [])
	let body = $state(initial?.body ?? '')
	let secrets = $state<SecretRow[]>(
		initial?.secretNames.map((n) => ({ name: n, value: '', stored: true, remove: false })) ?? [],
	)
	let signingSecret = $state('')
	let removeSigning = $state(false)
	let saving = $state(false)
	let showReference = $state(false)

	const allEvents = $derived(events.includes('*'))

	function applyPreset(p: WebhookPreset) {
		preset = p.key
		if (!name.trim()) name = p.label
		method = p.method
		url = p.url
		contentType = p.contentType
		headers = p.headers.map((h) => ({ ...h }))
		body = p.body
		const keep = secrets.filter((s) => s.stored || s.value)
		for (const n of p.secrets) {
			if (!keep.some((s) => s.name === n)) keep.push({ name: n, value: '', stored: false, remove: false })
		}
		secrets = keep
	}

	function toggleEvent(e: string) {
		events = events.includes(e) ? events.filter((x) => x !== e) : [...events.filter((x) => x !== '*'), e]
	}

	const requiredSecrets = $derived(meta.presets.find((p) => p.key === preset)?.secrets ?? [])

	const validationError = $derived.by(() => {
		if (!name.trim()) return m.admin_webhooks_error_name()
		if (events.length === 0) return m.admin_webhooks_error_events()
		if (!url.trim()) return m.admin_webhooks_error_url()
		for (const s of secrets) {
			if (!SECRET_NAME.test(s.name)) return m.admin_webhooks_error_secret_name({ name: s.name || '…' })
			if (!s.stored && !s.value && !s.remove) return m.admin_webhooks_error_secret_value({ name: s.name })
		}
		return null
	})

	async function save() {
		if (validationError) return
		saving = true
		try {
			const secretPatch: Record<string, string | null> = {}
			for (const s of secrets) {
				if (s.stored && s.remove) secretPatch[s.name] = null
				else if (s.value) secretPatch[s.name] = s.value
			}
			// Secret rows that were renamed away from a stored name drop the old one.
			for (const n of initial?.secretNames ?? []) {
				if (!secrets.some((s) => s.name === n)) secretPatch[n] = null
			}
			const payload: Record<string, unknown> = {
				name: name.trim(),
				enabled,
				preset,
				events,
				method,
				url,
				headers: headers.filter((h) => h.name.trim()),
				body: method === 'GET' ? null : body || null,
				contentType,
				secrets: secretPatch,
			}
			if (signingSecret) payload.signingSecret = signingSecret
			else if (removeSigning) payload.signingSecret = null

			const { webhook: saved } = initial
				? await api<{ webhook: WebhookView }>(`/api/admin/webhooks/${encodeURIComponent(initial.id)}`, {
						method: 'PATCH',
						body: JSON.stringify(payload),
					})
				: await api<{ webhook: WebhookView }>('/api/admin/webhooks', {
						method: 'POST',
						body: JSON.stringify(payload),
					})
			toast.success(m.admin_webhooks_saved())
			onSaved(saved)
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.admin_webhooks_save_failed())
		} finally {
			saving = false
		}
	}

	// --- Live preview -------------------------------------------------------

	let previewEvent = $state('plugin.approved')
	let preview = $state<RenderedRequest | null>(null)
	let previewError = $state<string | null>(null)
	let previewTimer: ReturnType<typeof setTimeout> | undefined

	$effect(() => {
		if (!events.includes('*') && events.length && !events.includes(previewEvent)) previewEvent = events[0]
	})

	$effect(() => {
		const req = {
			event: previewEvent,
			webhookId: initial?.id,
			secretNames: secrets.filter((s) => SECRET_NAME.test(s.name) && !s.remove).map((s) => s.name),
			// Typed values preview as-is; the response masks them.
			secrets: Object.fromEntries(
				secrets.filter((s) => SECRET_NAME.test(s.name) && s.value && !s.remove).map((s) => [s.name, s.value]),
			),
			definition: {
				method,
				url,
				headers: headers.filter((h) => h.name.trim()).map((h) => ({ ...h })),
				body: body || null,
				contentType,
			},
		}
		clearTimeout(previewTimer)
		if (!url.trim()) {
			preview = null
			previewError = null
			return
		}
		previewTimer = setTimeout(async () => {
			try {
				const out = await api<{ ok: boolean; request: RenderedRequest | null; error: string | null }>(
					'/api/admin/webhooks/preview',
					{ method: 'POST', body: JSON.stringify(req) },
				)
				preview = out.request
				previewError = out.error
			} catch (e) {
				preview = null
				previewError = e instanceof Error ? e.message : String(e)
			}
		}, 400)
		return () => clearTimeout(previewTimer)
	})

	async function copy(text: string) {
		try {
			await navigator.clipboard.writeText(text)
			toast.success(m.admin_webhooks_copied({ text }))
		} catch {
			// clipboard unavailable (insecure context) — nothing useful to do
		}
	}

	const SECRET_EXAMPLE = '{{secrets.NAME}}'
</script>

<Card>
	<CardHeader>
		<CardTitle class="text-base">
			{initial ? m.admin_webhooks_editor_edit() : m.admin_webhooks_editor_new()}
		</CardTitle>
	</CardHeader>
	<CardContent class="space-y-6">
		{#if !initial}
			<div class="space-y-2">
				<p class="text-xs font-medium uppercase tracking-wider text-muted-foreground">
					{m.admin_webhooks_preset_heading()}
				</p>
				<div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
					{#each meta.presets as p (p.key)}
						<button
							type="button"
							onclick={() => applyPreset(p)}
							class={cn(
								'rounded-md border p-3 text-left transition-colors hover:border-primary/60',
								preset === p.key ? 'border-primary bg-primary/5' : 'border-border',
							)}
						>
							<p class="text-sm font-medium">{p.label}</p>
							<p class="mt-1 text-xs text-muted-foreground">{p.description}</p>
						</button>
					{/each}
				</div>
			</div>
		{/if}

		<div class="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
			<div class="grid gap-1.5">
				<Label for="wh-name">{m.admin_webhooks_field_name()}</Label>
				<Input id="wh-name" bind:value={name} maxlength={120} />
			</div>
			<label class="flex h-9 items-center gap-2 text-sm cursor-pointer">
				<input type="checkbox" bind:checked={enabled} class="h-4 w-4 rounded border-input" />
				{m.admin_webhooks_enabled()}
			</label>
		</div>

		<fieldset class="space-y-2">
			<legend class="text-sm font-medium">{m.admin_webhooks_field_events()}</legend>
			<label class="flex items-center gap-2 text-sm cursor-pointer">
				<input
					type="checkbox"
					checked={allEvents}
					onchange={() => (events = allEvents ? [] : ['*'])}
					class="h-4 w-4 rounded border-input"
				/>
				{m.admin_webhooks_all_events()}
			</label>
			<div class="grid gap-x-4 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
				{#each meta.events as e (e)}
					<label class={cn('flex items-center gap-2 text-sm cursor-pointer', allEvents && 'opacity-50')}>
						<input
							type="checkbox"
							checked={allEvents || events.includes(e)}
							disabled={allEvents}
							onchange={() => toggleEvent(e)}
							class="h-4 w-4 rounded border-input"
						/>
						<code class="font-mono text-xs">{e}</code>
					</label>
				{/each}
			</div>
		</fieldset>

		<div class="grid gap-4 lg:grid-cols-2">
			<!-- Request template -->
			<div class="space-y-4 min-w-0">
				<div class="grid gap-3 grid-cols-[7rem_1fr]">
					<div class="grid gap-1.5">
						<Label for="wh-method">{m.admin_webhooks_field_method()}</Label>
						<Select id="wh-method" bind:value={method}>
							{#each METHODS as mth (mth)}<option value={mth}>{mth}</option>{/each}
						</Select>
					</div>
					<div class="grid gap-1.5 min-w-0">
						<Label for="wh-url">{m.admin_webhooks_field_url()}</Label>
						<Input id="wh-url" bind:value={url} class="font-mono text-xs" spellcheck={false} />
					</div>
				</div>

				<div class="space-y-2">
					<div class="flex items-center justify-between">
						<Label>{m.admin_webhooks_field_headers()}</Label>
						<Button size="sm" variant="ghost" onclick={() => (headers = [...headers, { name: '', value: '' }])}>
							<Plus class="h-3.5 w-3.5" />
							{m.admin_webhooks_add_header()}
						</Button>
					</div>
					{#each headers as h, i (i)}
						<div class="flex gap-2">
							<Input
								bind:value={h.name}
								placeholder={m.admin_webhooks_header_name()}
								class="w-2/5 font-mono text-xs"
								spellcheck={false}
							/>
							<Input
								bind:value={h.value}
								placeholder={m.admin_webhooks_header_value()}
								class="flex-1 font-mono text-xs"
								spellcheck={false}
							/>
							<Button
								size="icon"
								variant="ghost"
								onclick={() => (headers = headers.filter((_, j) => j !== i))}
								aria-label={m.common_remove()}
							>
								<Trash2 class="h-3.5 w-3.5" />
							</Button>
						</div>
					{/each}
				</div>

				{#if method !== 'GET'}
					<div class="grid gap-1.5">
						<div class="flex items-end justify-between gap-2">
							<Label for="wh-body">{m.admin_webhooks_field_body()}</Label>
							<Input
								bind:value={contentType}
								aria-label={m.admin_webhooks_field_content_type()}
								title={m.admin_webhooks_field_content_type()}
								class="h-7 w-48 font-mono text-[11px]"
							/>
						</div>
						<Textarea
							id="wh-body"
							bind:value={body}
							rows={14}
							spellcheck={false}
							class="font-mono text-xs leading-relaxed"
						/>
					</div>
				{/if}

				<div class="space-y-2">
					<div class="flex items-center justify-between">
						<Label class="flex items-center gap-1.5"><Lock class="h-3.5 w-3.5" />{m.admin_webhooks_field_secrets()}</Label>
						<Button
							size="sm"
							variant="ghost"
							onclick={() => (secrets = [...secrets, { name: '', value: '', stored: false, remove: false }])}
						>
							<Plus class="h-3.5 w-3.5" />
							{m.admin_webhooks_add_secret()}
						</Button>
					</div>
					<p class="text-xs text-muted-foreground">{m.admin_webhooks_secrets_hint({ example: SECRET_EXAMPLE })}</p>
					{#each secrets as s, i (i)}
						<div class={cn('flex gap-2 items-center', s.remove && 'opacity-50')}>
							<Input
								bind:value={s.name}
								disabled={s.stored}
								placeholder="API_KEY"
								class="w-2/5 font-mono text-xs uppercase"
								spellcheck={false}
							/>
							<Input
								type="password"
								bind:value={s.value}
								disabled={s.remove}
								autocomplete="new-password"
								placeholder={s.stored ? m.admin_webhooks_secret_keep_placeholder() : ''}
								class="flex-1 font-mono text-xs"
							/>
							{#if requiredSecrets.includes(s.name) && !s.stored && !s.value}
								<span class="text-[10px] text-amber-600 dark:text-amber-400 whitespace-nowrap">
									{m.admin_webhooks_secret_required()}
								</span>
							{/if}
							<Button
								size="icon"
								variant="ghost"
								onclick={() => {
									if (s.stored) s.remove = !s.remove
									else secrets = secrets.filter((_, j) => j !== i)
								}}
								aria-label={m.common_remove()}
							>
								<Trash2 class="h-3.5 w-3.5" />
							</Button>
						</div>
					{/each}
				</div>

				<div class="grid gap-1.5">
					<Label for="wh-signing">{m.admin_webhooks_field_signing()}</Label>
					<Input
						id="wh-signing"
						type="password"
						bind:value={signingSecret}
						autocomplete="new-password"
						disabled={removeSigning}
						class="font-mono text-xs"
					/>
					<p class="text-xs text-muted-foreground">
						{initial?.hasSigningSecret ? m.admin_webhooks_signing_set() : m.admin_webhooks_signing_hint()}
					</p>
					{#if initial?.hasSigningSecret}
						<label class="flex items-center gap-2 text-xs cursor-pointer">
							<input type="checkbox" bind:checked={removeSigning} class="h-3.5 w-3.5 rounded border-input" />
							{m.admin_webhooks_signing_remove()}
						</label>
					{/if}
				</div>
			</div>

			<!-- Preview + reference -->
			<div class="space-y-4 min-w-0">
				<div class="space-y-2">
					<div class="flex items-center justify-between gap-2">
						<p class="flex items-center gap-1.5 text-sm font-medium"><Eye class="h-3.5 w-3.5" />{m.admin_webhooks_preview()}</p>
						<Select bind:value={previewEvent} class="h-8 w-auto text-xs" aria-label={m.admin_webhooks_preview_event()}>
							{#each meta.events as e (e)}<option value={e}>{e}</option>{/each}
						</Select>
					</div>
					<p class="text-xs text-muted-foreground">{m.admin_webhooks_preview_note()}</p>
					{#if previewError}
						<p class="rounded border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
							{previewError}
						</p>
					{/if}
					{#if preview}
						<pre
							class="max-h-[32rem] overflow-auto rounded-md border border-border bg-muted/30 p-3 font-mono text-[11px] leading-relaxed">{preview.method} {preview.url}
{#each Object.entries(preview.headers) as [k, v]}{k}: {v}
{/each}
{prettyBody(preview.body)}</pre>
						{#if preview.missing.length}
							<p class="text-xs text-amber-600 dark:text-amber-400">
								{m.admin_webhooks_preview_missing({ list: preview.missing.join(', ') })}
							</p>
						{/if}
					{/if}
				</div>

				<div class="rounded-md border border-border">
					<button
						type="button"
						class="flex w-full items-center gap-1.5 px-3 py-2 text-sm font-medium"
						onclick={() => (showReference = !showReference)}
						aria-expanded={showReference}
					>
						<BookOpen class="h-3.5 w-3.5" />
						{m.admin_webhooks_reference()}
					</button>
					{#if showReference}
						<div class="space-y-3 border-t border-border px-3 py-3">
							<p class="text-xs text-muted-foreground">{m.admin_webhooks_reference_hint()}</p>
							<ul class="space-y-1">
								{#each meta.placeholders as p (p.path)}
									<li class="flex flex-wrap items-baseline gap-x-2 text-xs">
										<button
											type="button"
											class="font-mono text-primary hover:underline"
											onclick={() => copy(`{{${p.path}}}`)}>{`{{${p.path}}}`}</button
										>
										<span class="text-muted-foreground">{p.description}</span>
									</li>
								{/each}
							</ul>
							<ul class="space-y-1 border-t border-border/60 pt-3">
								{#each meta.filters as f (f.name)}
									<li class="flex flex-wrap items-baseline gap-x-2 text-xs">
										<code class="font-mono">| {f.name}</code>
										<span class="text-muted-foreground">{f.description}</span>
									</li>
								{/each}
							</ul>
						</div>
					{/if}
				</div>
			</div>
		</div>

		<div class="flex items-center justify-end gap-3 border-t border-border pt-4">
			{#if validationError}
				<p class="mr-auto text-xs text-muted-foreground">{validationError}</p>
			{/if}
			<Button size="sm" variant="ghost" onclick={onCancel} disabled={saving}>{m.common_cancel()}</Button>
			<Button size="sm" onclick={save} disabled={saving || !!validationError}>
				<Save class="h-3.5 w-3.5" />
				{saving ? m.common_saving() : m.common_save()}
			</Button>
		</div>
	</CardContent>
</Card>
