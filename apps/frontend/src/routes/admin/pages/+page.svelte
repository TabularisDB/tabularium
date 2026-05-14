<script lang="ts">
	import { onMount } from 'svelte'
	import { toast } from 'svelte-sonner'
	import Plus from '@lucide/svelte/icons/plus'
	import Trash2 from '@lucide/svelte/icons/trash-2'
	import Edit from '@lucide/svelte/icons/pencil'
	import Eye from '@lucide/svelte/icons/eye'
	import EyeOff from '@lucide/svelte/icons/eye-off'
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

	let pages = $state<AdminPage[]>([])
	let loading = $state(true)
	let busy = $state(false)

	let newSlug = $state('')
	let newTitle = $state('')
	let newPath = $state('')

	async function load() {
		loading = true
		try {
			const { data, error } = await eden.api.admin.pages.get()
			if (error) throw error
			pages = (data as { pages: AdminPage[] }).pages
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
				content: `# ${newTitle}\n\nWrite your page in Markdown.\n\n<tabularium-widget name="featured-plugins" limit="6" cols="3" />\n`,
				published: false,
			})
			if (error) throw new Error(typeof error.value === 'string' ? error.value : ((error.value as { error?: string })?.error ?? `Request failed (${error.status})`))
			toast.success('Page created')
			newSlug = ''
			newTitle = ''
			newPath = ''
			await load()
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Failed to create')
		} finally {
			busy = false
		}
	}

	async function togglePublish(p: AdminPage) {
		try {
			const { error } = await eden.api.admin.pages({ slug: p.slug }).patch({ published: !p.published })
			if (error) throw new Error(typeof error.value === 'string' ? error.value : ((error.value as { error?: string })?.error ?? `Request failed (${error.status})`))
			await load()
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Failed')
		}
	}

	async function remove(p: AdminPage) {
		if (!confirm(`Delete page '${p.slug}'?`)) return
		try {
			const { error } = await eden.api.admin.pages({ slug: p.slug }).delete()
			if (error) throw new Error(typeof error.value === 'string' ? error.value : ((error.value as { error?: string })?.error ?? `Request failed (${error.status})`))
			toast.success('Deleted')
			await load()
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Failed')
		}
	}
</script>

<header class="space-y-1">
	<h1 class="text-2xl font-semibold tracking-tight">Pages</h1>
	<p class="text-sm text-muted-foreground">Markdown-driven content. Rendered server-side with sanitization. Reachable at <code class="font-mono">/pages/:slug</code>.</p>
</header>

<Card>
	<CardHeader>
		<CardTitle class="text-base">All pages</CardTitle>
		<CardDescription>{pages.length} total · {pages.filter((p) => p.published).length} published</CardDescription>
	</CardHeader>
	<CardContent class="space-y-2">
		{#if loading}
			<p class="text-sm text-muted-foreground">Loading…</p>
		{:else if pages.length === 0}
			<p class="text-sm text-muted-foreground">No pages yet. Create your first below.</p>
		{:else}
			{#each pages as p (p.slug)}
				<div class="flex items-center justify-between gap-3 rounded-md border border-border bg-card/50 px-4 py-3">
					<div class="min-w-0 space-y-0.5 flex-1">
						<div class="flex items-center gap-2 flex-wrap">
							<span class="font-medium truncate">{p.title}</span>
							<Badge variant={p.published ? 'default' : 'secondary'} class="text-[10px]">{p.published ? 'published' : 'draft'}</Badge>
							{#if p.showInFooter}<Badge variant="outline" class="text-[10px]">footer</Badge>{/if}
							{#if p.path === '/'}<Badge variant="default" class="text-[10px]">homepage</Badge>{/if}
						</div>
						<div class="text-xs text-muted-foreground font-mono truncate">
							<span class="text-foreground">{p.path}</span>
							<span class="opacity-50"> · slug:{p.slug}</span>
						</div>
					</div>
					<div class="flex items-center gap-1 flex-shrink-0">
						<Button variant="ghost" size="sm" onclick={() => togglePublish(p)} aria-label={p.published ? 'Unpublish' : 'Publish'}>
							{#if p.published}<EyeOff class="h-3.5 w-3.5" />{:else}<Eye class="h-3.5 w-3.5" />{/if}
						</Button>
						<Button variant="ghost" size="sm" href={`/admin/pages/${p.slug}`} aria-label="Edit">
							<Edit class="h-3.5 w-3.5" />
						</Button>
						<Button variant="ghost" size="sm" onclick={() => remove(p)} aria-label="Delete">
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
		<CardTitle class="text-base">New page</CardTitle>
		<CardDescription>Page is created as a draft. Edit it after creation to set content + publish.</CardDescription>
	</CardHeader>
	<CardContent>
		<form onsubmit={create} class="space-y-4 max-w-md">
			<div class="grid gap-2">
				<Label for="new-slug">Internal slug</Label>
				<Input id="new-slug" bind:value={newSlug} placeholder="terms" pattern="[a-z0-9][a-z0-9-]*" required />
				<p class="text-xs text-muted-foreground">Used as the row identifier. Lowercase letters, digits, hyphens.</p>
			</div>
			<div class="grid gap-2">
				<Label for="new-title">Title</Label>
				<Input id="new-title" bind:value={newTitle} required maxlength={120} />
			</div>
			<div class="grid gap-2">
				<Label for="new-path">Public path (optional)</Label>
				<Input id="new-path" bind:value={newPath} placeholder="/about" />
				<p class="text-xs text-muted-foreground">
					Default <code class="font-mono">/pages/&lt;slug&gt;</code>. Use <code class="font-mono">/</code> for the homepage override.
				</p>
			</div>
			<Button type="submit" disabled={busy} size="sm">
				<Plus class="h-3.5 w-3.5" />
				{busy ? 'Creating…' : 'Create page'}
			</Button>
		</form>
	</CardContent>
</Card>
