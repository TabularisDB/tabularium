<script lang="ts">
	import { onMount } from 'svelte'
	import { toast } from 'svelte-sonner'
	import Plus from '@lucide/svelte/icons/plus'
	import Trash2 from '@lucide/svelte/icons/trash-2'
	import Card from '$components/ui/Card.svelte'
	import CardContent from '$components/ui/CardContent.svelte'
	import CardDescription from '$components/ui/CardDescription.svelte'
	import CardHeader from '$components/ui/CardHeader.svelte'
	import CardTitle from '$components/ui/CardTitle.svelte'
	import Button from '$components/ui/Button.svelte'
	import Input from '$components/ui/Input.svelte'
	import Label from '$components/ui/Label.svelte'
	import Badge from '$components/ui/Badge.svelte'
	import StickySaveBar from '$components/admin/StickySaveBar.svelte'
	import { eden } from '$lib/eden'
	import { m } from '$lib/paraglide/messages'

	type Scheme = { name: string; scheme: string; kinds?: string[] }
	type SchemeDraft = { name: string; scheme: string; kindsCsv: string }

	const SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*$/

	let loading = $state(true)
	let saving = $state(false)
	let drafts = $state<SchemeDraft[]>([])
	let initial = $state<SchemeDraft[]>([])

	function fromScheme(s: Scheme): SchemeDraft {
		return { name: s.name, scheme: s.scheme, kindsCsv: (s.kinds ?? []).join(', ') }
	}

	function toScheme(d: SchemeDraft): Scheme {
		const kinds = d.kindsCsv
			.split(',')
			.map((k) => k.trim())
			.filter((k) => k.length > 0)
		return kinds.length > 0
			? { name: d.name.trim(), scheme: d.scheme.trim(), kinds }
			: { name: d.name.trim(), scheme: d.scheme.trim() }
	}

	const dirty = $derived(JSON.stringify(drafts) !== JSON.stringify(initial))

	const invalid = $derived.by(() => {
		for (const d of drafts) {
			if (!d.name.trim()) return true
			if (!SCHEME_PATTERN.test(d.scheme.trim())) return true
		}
		return false
	})

	async function load() {
		loading = true
		try {
			const { data, error } = await eden.api.admin.instance['app-schemes'].get()
			if (error) throw error
			const incoming = ((data as { schemes: Scheme[] }).schemes ?? []).map(fromScheme)
			drafts = incoming.map((d) => ({ ...d }))
			initial = incoming
		} catch {
			toast.error(m.admin_app_handoff_load_failed())
		} finally {
			loading = false
		}
	}

	function addRow() {
		drafts = [...drafts, { name: '', scheme: '', kindsCsv: '' }]
	}

	function removeRow(i: number) {
		drafts = drafts.filter((_, idx) => idx !== i)
	}

	function discard() {
		drafts = initial.map((d) => ({ ...d }))
	}

	async function save() {
		if (invalid) return
		saving = true
		try {
			const payload = drafts.map(toScheme)
			const { error } = await eden.api.admin.instance['app-schemes'].put({ schemes: payload })
			if (error) throw error
			toast.success(m.admin_app_handoff_saved())
			await load()
		} catch {
			toast.error(m.admin_app_handoff_save_failed())
		} finally {
			saving = false
		}
	}

	onMount(load)
</script>

<Card>
	<CardHeader>
		<CardTitle class="text-base">{m.admin_app_handoff_title()}</CardTitle>
		<CardDescription>{m.admin_app_handoff_subtitle()}</CardDescription>
	</CardHeader>
	<CardContent class="space-y-4">
		{#if loading}
			<p class="text-sm text-muted-foreground">{m.common_loading()}</p>
		{:else if drafts.length === 0}
			<div class="rounded-md border border-dashed border-border p-6 text-center space-y-3">
				<p class="text-sm text-muted-foreground">{m.admin_app_handoff_empty()}</p>
				<Button size="sm" variant="outline" onclick={addRow}>
					<Plus class="h-3.5 w-3.5" />
					{m.admin_app_handoff_add()}
				</Button>
			</div>
		{:else}
			<div class="space-y-3">
				{#each drafts as draft, i (i)}
					<div class="rounded-md border border-border bg-card/50 px-4 py-3 space-y-3">
						<div class="grid gap-3 sm:grid-cols-2">
							<div class="space-y-1.5">
								<Label for={`scheme-name-${i}`}>{m.admin_app_handoff_field_name()}</Label>
								<Input id={`scheme-name-${i}`} bind:value={draft.name} placeholder="Tabularis Desktop" />
							</div>
							<div class="space-y-1.5">
								<Label for={`scheme-uri-${i}`}>{m.admin_app_handoff_field_scheme()}</Label>
								<Input
									id={`scheme-uri-${i}`}
									bind:value={draft.scheme}
									placeholder="tabularis"
									pattern="[a-z][a-z0-9+.\-]*"
								/>
							</div>
						</div>
						<div class="space-y-1.5">
							<Label for={`scheme-kinds-${i}`}>{m.admin_app_handoff_field_kinds()}</Label>
							<Input id={`scheme-kinds-${i}`} bind:value={draft.kindsCsv} placeholder="theme, widget" />
							<p class="text-xs text-muted-foreground">{m.admin_app_handoff_kinds_hint()}</p>
						</div>
						{#if draft.scheme.trim() && SCHEME_PATTERN.test(draft.scheme.trim())}
							<div class="flex items-center gap-2 text-[11px] font-mono text-muted-foreground">
								<Badge variant="outline" class="text-[10px]">preview</Badge>
								<code>{draft.scheme.trim()}://install?registry=…&slug=…&version=…</code>
							</div>
						{/if}
						<div class="flex justify-end">
							<Button variant="ghost" size="sm" onclick={() => removeRow(i)}>
								<Trash2 class="h-3.5 w-3.5" />
								{m.common_remove()}
							</Button>
						</div>
					</div>
				{/each}
			</div>
			<Button size="sm" variant="outline" onclick={addRow}>
				<Plus class="h-3.5 w-3.5" />
				{m.admin_app_handoff_add()}
			</Button>
		{/if}
	</CardContent>
</Card>

<StickySaveBar {dirty} {saving} disabled={invalid} onSave={save} onDiscard={discard} />
