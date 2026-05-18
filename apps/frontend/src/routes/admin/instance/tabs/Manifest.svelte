<script lang="ts">
	import { onMount } from 'svelte'
	import { toast } from 'svelte-sonner'
	import Card from '$components/ui/Card.svelte'
	import CardContent from '$components/ui/CardContent.svelte'
	import CardDescription from '$components/ui/CardDescription.svelte'
	import CardHeader from '$components/ui/CardHeader.svelte'
	import CardTitle from '$components/ui/CardTitle.svelte'
	import Button from '$components/ui/Button.svelte'
	import Input from '$components/ui/Input.svelte'
	import Label from '$components/ui/Label.svelte'
	import StickySaveBar from '$components/admin/StickySaveBar.svelte'
	import { eden } from '$lib/eden'
	import { m } from '$lib/paraglide/messages'

	type ManifestState = {
		allowedFiles: string[]
		defaultFiles: string[]
		schemaUrl: string
		filesOverridden: boolean
		schemaUrlOverridden: boolean
	}

	const FILE_RE = /^\.?[a-z][a-z0-9-]*(\.(yaml|yml|json))?$/

	let files = $state<string[]>([])
	let schemaUrl = $state('')
	let defaults = $state<{ files: string[]; schemaUrl: string }>({ files: [], schemaUrl: '' })
	let filesOverridden = $state(false)
	let newFileInput = $state('')
	let loading = $state(true)
	let saving = $state(false)

	let initialFiles = $state('')
	let initialSchemaUrl = $state('')

	const dirty = $derived(JSON.stringify(files) !== initialFiles || schemaUrl !== initialSchemaUrl)

	function extractError(error: unknown): string {
		const e = error as { value?: unknown; status?: number }
		if (typeof e.value === 'string') return e.value
		const v = e.value as { error?: string } | undefined
		return v?.error ?? `Request failed (${e.status ?? '?'})`
	}

	function sameAsDefault(a: string[], b: string[]): boolean {
		if (a.length !== b.length) return false
		const sa = [...a].sort()
		const sb = [...b].sort()
		return sa.every((v, i) => v === sb[i])
	}

	async function load() {
		try {
			const { data, error } = await eden.api.admin.instance.get()
			if (error) throw new Error(extractError(error))
			const res = data as { manifest: ManifestState }
			files = [...res.manifest.allowedFiles]
			schemaUrl = res.manifest.schemaUrlOverridden ? res.manifest.schemaUrl : ''
			defaults = { files: res.manifest.defaultFiles, schemaUrl: res.manifest.schemaUrl }
			filesOverridden = res.manifest.filesOverridden
			initialFiles = JSON.stringify(files)
			initialSchemaUrl = schemaUrl
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.admin_instance_load_failed())
		} finally {
			loading = false
		}
	}

	async function save() {
		saving = true
		try {
			const filesPayload = sameAsDefault(files, defaults.files) ? null : files
			const { error } = await eden.api.admin.instance.put({
				manifestAllowedFiles: filesPayload,
				manifestSchemaUrl: schemaUrl.trim() ? schemaUrl.trim() : null,
			})
			if (error) throw new Error(extractError(error))
			toast.success(m.admin_manifest_saved())
			await load()
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.admin_manifest_save_failed())
		} finally {
			saving = false
		}
	}

	function discard() {
		load()
	}

	function addFile() {
		const v = newFileInput.trim()
		if (!v) return
		if (!FILE_RE.test(v) || v.length > 60) {
			toast.error(m.admin_manifest_filename_invalid())
			return
		}
		if (files.includes(v)) {
			toast.error(m.admin_manifest_filename_duplicate())
			return
		}
		if (files.length >= 12) {
			toast.error(m.admin_manifest_filename_too_many())
			return
		}
		files = [...files, v]
		newFileInput = ''
	}

	function removeFile(file: string) {
		if (files.length <= 1) {
			toast.error(m.admin_manifest_filename_one_required())
			return
		}
		files = files.filter((f) => f !== file)
	}

	function resetFilesToDefaults() {
		files = [...defaults.files]
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
			<CardTitle class="text-base">{m.admin_manifest_card_title()}</CardTitle>
			<CardDescription>{m.admin_manifest_card_subtitle()}</CardDescription>
		</CardHeader>
		<CardContent class="space-y-4">
			{#if loading}
				<p class="text-sm text-muted-foreground">{m.common_loading()}</p>
			{:else}
				<div class="grid gap-2 max-w-xl">
					<div class="flex items-center justify-between">
						<Label>{m.admin_manifest_allowed_files()}</Label>
						{#if filesOverridden}
							<button
								type="button"
								class="text-xs text-muted-foreground hover:text-foreground underline"
								onclick={resetFilesToDefaults}
							>
								{m.admin_manifest_reset_to_defaults()}
							</button>
						{/if}
					</div>
					<p class="text-xs text-muted-foreground">{m.admin_manifest_allowed_files_hint()}</p>
					<ul class="grid gap-1.5 rounded-md border border-border bg-card/50 p-3">
						{#each files as file (file)}
							<li class="flex items-center justify-between gap-2 group">
								<code class="font-mono text-sm">{file}</code>
								<button
									type="button"
									class="text-xs text-muted-foreground hover:text-destructive opacity-60 group-hover:opacity-100"
									onclick={() => removeFile(file)}
									aria-label={m.common_remove()}
								>
									{m.common_remove()}
								</button>
							</li>
						{/each}
					</ul>
					<div class="flex gap-2">
						<Input
							placeholder=".my-manifest"
							bind:value={newFileInput}
							maxlength={60}
							onkeydown={(e) => {
								if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) {
									e.preventDefault()
									addFile()
								}
							}}
						/>
						<Button variant="outline" size="sm" onclick={addFile}>{m.common_add()}</Button>
					</div>
				</div>
				<div class="grid gap-2 max-w-md">
					<Label for="manifestSchemaUrl">{m.admin_manifest_schema_url()}</Label>
					<Input id="manifestSchemaUrl" bind:value={schemaUrl} maxlength={500} placeholder={defaults.schemaUrl} />
					<p class="text-xs text-muted-foreground">{m.admin_manifest_schema_url_hint()}</p>
				</div>
			{/if}
		</CardContent>
	</Card>
</div>

<StickySaveBar {dirty} {saving} onSave={save} onDiscard={discard} />
