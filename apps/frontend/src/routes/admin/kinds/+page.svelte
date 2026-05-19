<script lang="ts">
	import { onMount } from 'svelte'
	import { toast } from 'svelte-sonner'
	import Plus from '@lucide/svelte/icons/plus'
	import Save from '@lucide/svelte/icons/save'
	import Trash2 from '@lucide/svelte/icons/trash-2'
	import Card from '$components/ui/Card.svelte'
	import CardContent from '$components/ui/CardContent.svelte'
	import CardDescription from '$components/ui/CardDescription.svelte'
	import CardHeader from '$components/ui/CardHeader.svelte'
	import CardTitle from '$components/ui/CardTitle.svelte'
	import Button from '$components/ui/Button.svelte'
	import Input from '$components/ui/Input.svelte'
	import AdminPageHeader from '$components/admin/AdminPageHeader.svelte'
	import CollapsibleRow from '$components/admin/CollapsibleRow.svelte'
	import ConfirmDialog from '$components/ui/ConfirmDialog.svelte'
	import ExtensionsEditor, { type ExtensionsDelta } from '$components/admin/ExtensionsEditor.svelte'
	import { eden } from '$lib/eden'
	import type { Kind } from '$lib/types'
	import { m } from '$lib/paraglide/messages'

	type KindRow = Kind & {
		extensionsSchema: ExtensionsDelta
		extOpen: boolean
		publicPageOpen: boolean
		publicPageEnabled: boolean
		publicPageHero: string
		publicPageIntro: string
	}

	let kinds = $state<KindRow[]>([])
	let loading = $state(true)
	let newKey = $state('')
	let newLabel = $state('')
	let newDescription = $state('')
	let creating = $state(false)
	let savingKey = $state<string | null>(null)
	let deleteTarget = $state<Kind | null>(null)
	let deletingKey = $state<string | null>(null)

	onMount(loadKinds)

	function extractError(error: unknown): string {
		const e = error as { value?: unknown; status?: number }
		if (typeof e.value === 'string') return e.value
		const v = e.value as { error?: string } | undefined
		return v?.error ?? `Request failed (${e.status ?? '?'})`
	}

	async function loadKinds() {
		loading = true
		try {
			const { data, error } = await eden.api.admin.kinds.get()
			if (error) throw error
			const list = (data as { kinds: Array<Kind & { extensionsSchema?: Record<string, unknown> | null }> }).kinds
			kinds = list.map((k) => ({
				...k,
				extensionsSchema: (k.extensionsSchema as ExtensionsDelta | null) ?? {},
				extOpen: false,
				publicPageOpen: false,
				publicPageEnabled: k.publicPageEnabled === true,
				publicPageHero: k.publicPageCopy?.hero ?? '',
				publicPageIntro: k.publicPageCopy?.intro ?? '',
			}))
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.admin_kinds_load_failed())
		} finally {
			loading = false
		}
	}

	async function addKind() {
		if (!newKey.trim() || !newLabel.trim()) return
		creating = true
		try {
			const { error } = await eden.api.admin.kinds.post({
				key: newKey.trim(),
				label: newLabel.trim(),
				description: newDescription.trim() || null,
			})
			if (error) {
				if (error.status === 409) toast.error(m.admin_kinds_duplicate())
				else toast.error(extractError(error))
				return
			}
			toast.success(m.admin_kinds_created())
			newKey = ''
			newLabel = ''
			newDescription = ''
			await loadKinds()
		} finally {
			creating = false
		}
	}

	async function saveKind(k: KindRow) {
		savingKey = k.key
		try {
			const payload = Object.keys(k.extensionsSchema).length === 0 ? null : k.extensionsSchema
			const heroTrim = k.publicPageHero.trim()
			const introTrim = k.publicPageIntro.trim()
			const publicPageCopy = heroTrim || introTrim ? { hero: heroTrim || null, intro: introTrim || null } : null
			const { error } = await eden.api.admin.kinds({ key: k.key }).put({
				key: k.key,
				label: k.label,
				description: k.description,
				extensionsSchema: payload,
				publicPageEnabled: k.publicPageEnabled,
				publicPageCopy,
			})
			if (error) {
				toast.error(extractError(error))
				return
			}
			toast.success(m.admin_kinds_updated())
			await loadKinds()
		} finally {
			savingKey = null
		}
	}

	function openDeleteKind(k: Kind) {
		deleteTarget = k
	}

	async function confirmDeleteKind() {
		const k = deleteTarget
		if (!k) return
		deletingKey = k.key
		try {
			const { error } = await eden.api.admin.kinds({ key: k.key }).delete()
			if (error) {
				toast.error(extractError(error))
				return
			}
			toast.success(m.admin_kinds_deleted())
			deleteTarget = null
			await loadKinds()
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.admin_kinds_save_failed())
		} finally {
			deletingKey = null
		}
	}

	function onCreateKey(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault()
			addKind()
		}
	}

	function onEditKey(e: KeyboardEvent, k: KindRow) {
		if (e.key === 'Enter' && !e.shiftKey && (e.metaKey || e.ctrlKey || (e.target as HTMLElement).tagName === 'INPUT')) {
			e.preventDefault()
			saveKind(k)
		}
	}
</script>

<AdminPageHeader title={m.admin_kinds_title()} subtitle={m.admin_kinds_subtitle()} />

{#if loading}
	<p class="text-sm text-muted-foreground">{m.common_loading()}</p>
{:else}
	{#if kinds.length === 0}
		<p class="text-sm text-muted-foreground italic">{m.admin_kinds_empty()}</p>
	{:else}
		<div class="space-y-3">
			{#each kinds as k (k.key)}
				<Card>
					<CardHeader>
						<CardTitle class="text-base font-mono">{k.key}</CardTitle>
					</CardHeader>
					<CardContent class="space-y-3">
						<label class="block space-y-1">
							<span class="text-xs font-medium text-muted-foreground">{m.admin_kinds_field_label()}</span>
							<Input bind:value={k.label} onkeydown={(e) => onEditKey(e, k)} />
						</label>
						<label class="block space-y-1">
							<span class="text-xs font-medium text-muted-foreground">{m.admin_kinds_field_description()}</span>
							<Input
								value={k.description ?? ''}
								oninput={(e) => (k.description = (e.currentTarget as HTMLInputElement).value)}
								onkeydown={(e) => onEditKey(e, k)}
							/>
						</label>

						<CollapsibleRow bind:expanded={k.extOpen} name={m.admin_kinds_ext_toggle()}>
							{#snippet header()}
								<span class="text-sm font-medium">{m.admin_kinds_ext_toggle()}</span>
								{#if Object.keys(k.extensionsSchema).length > 0}
									<span class="text-[10px] uppercase tracking-wide text-primary ml-2"
										>{m.admin_kinds_ext_override_active()}</span
									>
								{:else}
									<span class="text-xs text-muted-foreground ml-2 truncate">{m.admin_kinds_ext_empty_reverts()}</span>
								{/if}
							{/snippet}
							<p class="text-xs text-muted-foreground">{m.admin_kinds_ext_hint()}</p>
							<ExtensionsEditor bind:value={k.extensionsSchema} templates={false} minHeight="14rem" />
						</CollapsibleRow>

						<CollapsibleRow bind:expanded={k.publicPageOpen} name={m.admin_kinds_public_page_toggle()}>
							{#snippet header()}
								<span class="text-sm font-medium">{m.admin_kinds_public_page_toggle()}</span>
								{#if k.publicPageEnabled}
									<span class="text-[10px] uppercase tracking-wide text-primary ml-2"
										>{m.admin_kinds_public_page_enabled_pill()}</span
									>
								{:else}
									<span class="text-xs text-muted-foreground ml-2 truncate"
										>{m.admin_kinds_public_page_disabled_hint()}</span
									>
								{/if}
							{/snippet}
							<p class="text-xs text-muted-foreground">{m.admin_kinds_public_page_hint({ key: k.key })}</p>
							<label class="flex items-center gap-2 text-sm cursor-pointer">
								<input type="checkbox" bind:checked={k.publicPageEnabled} class="h-4 w-4 rounded border-input" />
								<span>{m.admin_kinds_public_page_enable({ key: k.key })}</span>
							</label>
							{#if k.publicPageEnabled}
								<label class="block space-y-1 mt-3">
									<span class="text-xs font-medium text-muted-foreground">{m.admin_kinds_public_page_hero()}</span>
									<Input bind:value={k.publicPageHero} placeholder={k.label} maxlength={80} />
								</label>
								<label class="block space-y-1 mt-3">
									<span class="text-xs font-medium text-muted-foreground">{m.admin_kinds_public_page_intro()}</span>
									<Input bind:value={k.publicPageIntro} placeholder={k.description ?? ''} maxlength={600} />
								</label>
							{/if}
						</CollapsibleRow>

						<div class="flex gap-2 justify-end">
							<Button size="sm" variant="outline" onclick={() => openDeleteKind(k)}>
								<Trash2 class="h-3.5 w-3.5" />
								{m.admin_kinds_delete_button()}
							</Button>
							<Button size="sm" onclick={() => saveKind(k)} disabled={savingKey === k.key}>
								<Save class="h-3.5 w-3.5" />
								{savingKey === k.key ? m.common_saving() : m.common_save()}
							</Button>
						</div>
					</CardContent>
				</Card>
			{/each}
		</div>
	{/if}

	<Card>
		<CardHeader>
			<CardTitle class="text-base">{m.admin_kinds_add_heading()}</CardTitle>
			<CardDescription>{m.admin_kinds_field_key_hint()}</CardDescription>
		</CardHeader>
		<CardContent class="space-y-3">
			<label class="block space-y-1">
				<span class="text-xs font-medium text-muted-foreground">{m.admin_kinds_field_key()}</span>
				<Input bind:value={newKey} placeholder="theme" onkeydown={onCreateKey} />
			</label>
			<label class="block space-y-1">
				<span class="text-xs font-medium text-muted-foreground">{m.admin_kinds_field_label()}</span>
				<Input bind:value={newLabel} placeholder="Themes" onkeydown={onCreateKey} />
			</label>
			<label class="block space-y-1">
				<span class="text-xs font-medium text-muted-foreground">{m.admin_kinds_field_description()}</span>
				<Input bind:value={newDescription} onkeydown={onCreateKey} />
			</label>
			<div class="flex justify-end">
				<Button size="sm" onclick={addKind} disabled={creating || !newKey.trim() || !newLabel.trim()}>
					<Plus class="h-3.5 w-3.5" />
					{m.admin_kinds_add_button()}
				</Button>
			</div>
		</CardContent>
	</Card>
{/if}

{#if deleteTarget}
	<ConfirmDialog
		open={deleteTarget !== null}
		title={m.admin_kinds_delete_button()}
		description={m.admin_kinds_delete_confirm()}
		confirmWord={deleteTarget.key}
		confirmLabel={m.admin_kinds_delete_button()}
		busy={deletingKey === deleteTarget.key}
		onConfirm={confirmDeleteKind}
		onCancel={() => (deleteTarget = null)}
	/>
{/if}
