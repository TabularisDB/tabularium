<script lang="ts">
	import { onMount } from 'svelte'
	import { toast } from 'svelte-sonner'
	import Plus from '@lucide/svelte/icons/plus'
	import Trash2 from '@lucide/svelte/icons/trash-2'
	import Edit from '@lucide/svelte/icons/pencil'
	import Eye from '@lucide/svelte/icons/eye'
	import EyeOff from '@lucide/svelte/icons/eye-off'
	import Search from '@lucide/svelte/icons/search'
	import Card from '$components/ui/Card.svelte'
	import CardContent from '$components/ui/CardContent.svelte'
	import CardHeader from '$components/ui/CardHeader.svelte'
	import CardTitle from '$components/ui/CardTitle.svelte'
	import CardDescription from '$components/ui/CardDescription.svelte'
	import Button from '$components/ui/Button.svelte'
	import Input from '$components/ui/Input.svelte'
	import Label from '$components/ui/Label.svelte'
	import Badge from '$components/ui/Badge.svelte'
	import { eden } from '$lib/eden'
	import { m } from '$lib/paraglide/messages'
	import AdminPageHeader from '$components/admin/AdminPageHeader.svelte'
	import TabBar from '$components/admin/TabBar.svelte'
	import ConfirmDialog from '$components/ui/ConfirmDialog.svelte'

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

	let allPages = $state<AdminPage[]>([])
	let loading = $state(true)
	let busy = $state(false)
	let removing = $state(false)
	let deleteTarget = $state<AdminPage | null>(null)
	let filter = $state<'all' | 'published' | 'draft'>('all')
	let search = $state('')

	let newSlug = $state('')
	let newTitle = $state('')
	let newPath = $state('')

	const counts = $derived.by(() => {
		let published = 0
		let draft = 0
		for (const p of allPages) {
			if (p.published) published++
			else draft++
		}
		return { all: allPages.length, published, draft }
	})

	const pages = $derived.by(() => {
		const q = search.trim().toLowerCase()
		return allPages
			.filter((p) => {
				if (filter === 'published' && !p.published) return false
				if (filter === 'draft' && p.published) return false
				if (!q) return true
				return p.title.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q) || p.path.toLowerCase().includes(q)
			})
			.sort((a, b) => b.updatedAt - a.updatedAt)
	})

	async function load() {
		loading = true
		try {
			const { data, error } = await eden.api.admin.pages.get()
			if (error) throw error
			allPages = (data as { pages: AdminPage[] }).pages
		} finally {
			loading = false
		}
	}

	onMount(load)

	async function create(e: SubmitEvent) {
		e.preventDefault()
		busy = true
		try {
			const { error } = await eden.api.admin.pages.post({
				slug: newSlug,
				path: newPath.trim() || undefined,
				title: newTitle,
				content: `# ${newTitle}\n\nWrite your page in Markdown.\n`,
				published: false,
			})
			if (error)
				throw new Error(
					typeof error.value === 'string'
						? error.value
						: ((error.value as { error?: string })?.error ?? `Request failed (${error.status})`),
				)
			toast.success(m.admin_pages_created())
			newSlug = ''
			newTitle = ''
			newPath = ''
			await load()
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.admin_pages_create_failed())
		} finally {
			busy = false
		}
	}

	async function togglePublish(p: AdminPage) {
		try {
			const { error } = await eden.api.admin.pages({ slug: p.slug }).patch({ published: !p.published })
			if (error)
				throw new Error(
					typeof error.value === 'string'
						? error.value
						: ((error.value as { error?: string })?.error ?? `Request failed (${error.status})`),
				)
			await load()
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.admin_pages_action_failed())
		}
	}

	function openRemove(p: AdminPage) {
		deleteTarget = p
	}

	async function confirmRemove() {
		const p = deleteTarget
		if (!p) return
		removing = true
		try {
			const { error } = await eden.api.admin.pages({ slug: p.slug }).delete()
			if (error)
				throw new Error(
					typeof error.value === 'string'
						? error.value
						: ((error.value as { error?: string })?.error ?? `Request failed (${error.status})`),
				)
			toast.success(m.admin_pages_deleted())
			deleteTarget = null
			await load()
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.admin_pages_action_failed())
		} finally {
			removing = false
		}
	}
</script>

<AdminPageHeader title={m.admin_pages_title()}>
	{#snippet subtitleSnippet()}
		{m.admin_pages_subtitle_prefix()} <code class="font-mono">/pages/:slug</code>.
	{/snippet}
</AdminPageHeader>

<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
	<TabBar
		size="sm"
		bind:active={filter}
		tabs={[
			{ id: 'all', label: m.admin_pages_tab_all(), badge: counts.all },
			{ id: 'published', label: m.admin_pages_published(), badge: counts.published },
			{ id: 'draft', label: m.admin_pages_draft(), badge: counts.draft },
		]}
	/>
	<div class="relative w-full sm:w-72">
		<Search class="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
		<Input bind:value={search} class="pl-9" placeholder={m.admin_pages_search_placeholder()} />
	</div>
</div>

<Card>
	<CardHeader>
		<CardTitle class="text-base">{m.admin_pages_all()}</CardTitle>
		<CardDescription>{m.admin_pages_count({ total: allPages.length, published: counts.published })}</CardDescription>
	</CardHeader>
	<CardContent class="space-y-2">
		{#if loading}
			<p class="text-sm text-muted-foreground">{m.common_loading()}</p>
		{:else if pages.length === 0}
			<p class="text-sm text-muted-foreground">{m.admin_pages_empty()}</p>
		{:else}
			{#each pages as p (p.slug)}
				<div class="flex items-center justify-between gap-3 rounded-md border border-border bg-card/50 px-4 py-3">
					<div class="min-w-0 space-y-0.5 flex-1">
						<div class="flex items-center gap-2 flex-wrap">
							<span class="font-medium truncate">{p.title}</span>
							<Badge variant={p.published ? 'default' : 'secondary'} class="text-[10px]"
								>{p.published ? m.admin_pages_published() : m.admin_pages_draft()}</Badge
							>
							{#if p.showInFooter}<Badge variant="outline" class="text-[10px]">{m.admin_pages_footer()}</Badge>{/if}
							{#if p.path === '/'}<Badge variant="default" class="text-[10px]">{m.admin_pages_homepage()}</Badge>{/if}
						</div>
						<div class="text-xs text-muted-foreground font-mono truncate">
							<span class="text-foreground">{p.path}</span>
							<span class="opacity-50"> · slug:{p.slug}</span>
						</div>
					</div>
					<div class="flex items-center gap-1 flex-shrink-0">
						<Button
							variant="ghost"
							size="sm"
							onclick={() => togglePublish(p)}
							aria-label={p.published ? m.admin_pages_unpublish() : m.admin_pages_publish()}
						>
							{#if p.published}<EyeOff class="h-3.5 w-3.5" />{:else}<Eye class="h-3.5 w-3.5" />{/if}
						</Button>
						<Button variant="ghost" size="sm" href={`/admin/pages/${p.slug}`} aria-label={m.admin_pages_edit()}>
							<Edit class="h-3.5 w-3.5" />
						</Button>
						<Button variant="ghost" size="sm" onclick={() => openRemove(p)} aria-label={m.admin_pages_delete()}>
							<Trash2 class="h-3.5 w-3.5" />
						</Button>
					</div>
				</div>
			{/each}
		{/if}
	</CardContent>
</Card>

<Card>
	<CardHeader>
		<CardTitle class="text-base">{m.admin_pages_new()}</CardTitle>
		<CardDescription>{m.admin_pages_new_subtitle()}</CardDescription>
	</CardHeader>
	<CardContent>
		<form onsubmit={create} class="space-y-4 max-w-md">
			<div class="grid gap-2">
				<Label for="new-slug">{m.admin_pages_internal_slug()}</Label>
				<Input id="new-slug" bind:value={newSlug} placeholder="terms" pattern="[a-z0-9][a-z0-9-]*" required />
				<p class="text-xs text-muted-foreground">{m.admin_pages_internal_slug_note()}</p>
			</div>
			<div class="grid gap-2">
				<Label for="new-title">{m.admin_pages_title_field()}</Label>
				<Input id="new-title" bind:value={newTitle} required maxlength={120} />
			</div>
			<div class="grid gap-2">
				<Label for="new-path">{m.admin_pages_public_path()}</Label>
				<Input id="new-path" bind:value={newPath} placeholder="/about" />
				<p class="text-xs text-muted-foreground">
					{m.admin_pages_public_path_note_prefix()}
					<code class="font-mono">/pages/&lt;slug&gt;</code>{m.admin_pages_public_path_note_middle()}
					<code class="font-mono">/</code>
					{m.admin_pages_public_path_note_suffix()}
				</p>
			</div>
			<Button type="submit" disabled={busy} size="sm">
				<Plus class="h-3.5 w-3.5" />
				{busy ? m.admin_pages_creating() : m.admin_pages_create_button()}
			</Button>
		</form>
	</CardContent>
</Card>

{#if deleteTarget}
	<ConfirmDialog
		open={deleteTarget !== null}
		title={m.admin_pages_delete()}
		description={m.admin_pages_confirm_delete({ slug: deleteTarget.slug })}
		confirmWord={deleteTarget.slug}
		confirmLabel={m.admin_pages_delete()}
		busy={removing}
		onConfirm={confirmRemove}
		onCancel={() => (deleteTarget = null)}
	/>
{/if}
