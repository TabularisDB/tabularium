<script lang="ts">
	import { onMount } from 'svelte'
	import { page } from '$app/state'
	import { goto } from '$app/navigation'
	import { toast } from 'svelte-sonner'
	import Save from '@lucide/svelte/icons/save'
	import Eye from '@lucide/svelte/icons/eye'
	import EyeOff from '@lucide/svelte/icons/eye-off'
	import ArrowLeft from '@lucide/svelte/icons/arrow-left'
	import Card from '$components/ui/Card.svelte'
	import CardContent from '$components/ui/CardContent.svelte'
	import CardHeader from '$components/ui/CardHeader.svelte'
	import CardTitle from '$components/ui/CardTitle.svelte'
	import Button from '$components/ui/Button.svelte'
	import Input from '$components/ui/Input.svelte'
	import Label from '$components/ui/Label.svelte'
	import CmsPage from '$components/CmsPage.svelte'
	import { eden } from '$lib/eden'
	import { m } from '$lib/paraglide/messages'

	const slug = $derived(page.params.slug)

	type AdminPage = {
		slug: string
		path: string
		title: string
		content: string
		published: boolean
		navOrder: number | null
		showInFooter: boolean
		createdAt: number
		updatedAt: number
	}

	const SEEDED_PATHS = new Set(['/about', '/privacy', '/terms'])

	let title = $state('')
	let path = $state('')
	let content = $state('')
	let published = $state(false)
	let showInFooter = $state(false)
	let navOrder = $state<number | null>(null)
	let loading = $state(true)
	let saving = $state(false)
	let preview = $state(true)
	let previewHtml = $state('')
	let previewLoading = $state(false)
	let previewTimer: ReturnType<typeof setTimeout> | null = null

	const pathLocked = $derived(SEEDED_PATHS.has(path))

	async function load() {
		loading = true
		try {
			const { data, error } = await eden.api.admin.pages({ slug }).get()
			if (error) throw new Error(typeof error.value === 'string' ? error.value : ((error.value as { error?: string })?.error ?? `Request failed (${error.status})`))
			const res = data as AdminPage
			title = res.title
			path = res.path
			content = res.content
			published = res.published
			showInFooter = res.showInFooter
			navOrder = res.navOrder
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.admin_page_edit_load_failed())
		} finally {
			loading = false
		}
	}

	async function refreshPreview() {
		previewLoading = true
		try {
			const { data, error } = await eden.api.admin.pages.preview.post({ content })
			if (error) throw error
			previewHtml = (data as { html: string }).html
		} catch {
			previewHtml = `<p class="text-destructive text-sm">${m.admin_page_edit_preview_failed()}</p>`
		} finally {
			previewLoading = false
		}
	}

	onMount(load)

	$effect(() => {
		if (loading || !preview) return
		void content
		if (previewTimer) clearTimeout(previewTimer)
		previewTimer = setTimeout(refreshPreview, 350)
	})

	async function save() {
		saving = true
		try {
			const body: Record<string, unknown> = {
				title,
				content,
				published,
				showInFooter,
				navOrder,
			}
			if (!pathLocked) body.path = path
			const { error } = await eden.api.admin.pages({ slug }).patch(body)
			if (error) throw new Error(typeof error.value === 'string' ? error.value : ((error.value as { error?: string })?.error ?? `Request failed (${error.status})`))
			toast.success(m.admin_page_edit_saved())
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.admin_page_edit_save_failed())
		} finally {
			saving = false
		}
	}
</script>

<div class="flex items-center justify-between">
	<Button variant="ghost" size="sm" onclick={() => goto('/admin/pages')}>
		<ArrowLeft class="h-3.5 w-3.5" />
		{m.admin_page_edit_back()}
	</Button>
	<div class="flex gap-2">
		{#if !loading}
			<Button variant="ghost" size="sm" onclick={() => (preview = !preview)}>
				{#if preview}<EyeOff class="h-3.5 w-3.5" />{m.admin_page_edit_hide_preview()}{:else}<Eye class="h-3.5 w-3.5" />{m.admin_page_edit_show_preview()}{/if}
			</Button>
			<Button size="sm" onclick={save} disabled={saving}>
				<Save class="h-3.5 w-3.5" />
				{saving ? m.common_saving() : m.common_save()}
			</Button>
		{/if}
	</div>
</div>

{#if loading}
	<p class="text-sm text-muted-foreground">{m.common_loading()}</p>
{:else}
	<Card>
		<CardHeader>
			<CardTitle class="text-base">{slug}</CardTitle>
		</CardHeader>
		<CardContent class="space-y-4">
			<div class="grid gap-2">
				<Label for="title">{m.admin_page_edit_title()}</Label>
				<Input id="title" bind:value={title} maxlength={120} />
			</div>

			<div class="grid gap-2">
				<Label for="path">{m.admin_page_edit_path()}</Label>
				<Input id="path" bind:value={path} placeholder="/about" readonly={pathLocked} />
				<p class="text-xs text-muted-foreground">
					{#if pathLocked}
						Built-in page — path is fixed.
					{:else}
						Public URL where this page is served. Any non-reserved path is allowed.
					{/if}
				</p>
			</div>

			<div class="flex items-center gap-4 flex-wrap">
				<label class="flex items-center gap-2 cursor-pointer text-sm">
					<input type="checkbox" bind:checked={published} class="h-4 w-4 rounded border-input" />
					<span>{m.admin_page_edit_published()}</span>
				</label>
				<label class="flex items-center gap-2 cursor-pointer text-sm">
					<input type="checkbox" bind:checked={showInFooter} class="h-4 w-4 rounded border-input" />
					<span>{m.admin_page_edit_show_in_footer()}</span>
				</label>
				<div class="flex items-center gap-2 text-sm">
					<Label for="nav-order" class="text-xs text-muted-foreground">{m.admin_page_edit_nav_order()}</Label>
					<input
						id="nav-order"
						type="number"
						bind:value={navOrder}
						class="h-9 w-20 rounded-md border border-input bg-card px-2 text-sm"
					/>
				</div>
			</div>

			<div class="grid gap-2">
				<Label>{m.admin_page_edit_content_label({ format: 'Markdown' })}</Label>
				<div class={preview ? 'grid gap-3 lg:grid-cols-2' : 'grid gap-3'}>
					<textarea
						bind:value={content}
						class="min-h-[480px] w-full rounded-md border border-input bg-card p-3 font-mono text-sm leading-relaxed"
						spellcheck="false"
					></textarea>
					{#if preview}
						<div class="rounded-md border border-input bg-background p-4 overflow-auto min-h-[480px]">
							{#if previewLoading && !previewHtml}
								<p class="text-xs text-muted-foreground">{m.admin_page_edit_rendering()}</p>
							{:else}
								<CmsPage html={previewHtml} />
							{/if}
						</div>
					{/if}
				</div>
				<p class="text-xs text-muted-foreground">
					{m.admin_page_edit_help_markdown()}
				</p>
			</div>
		</CardContent>
	</Card>
{/if}
