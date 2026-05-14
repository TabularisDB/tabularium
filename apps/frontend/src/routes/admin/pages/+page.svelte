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
	import { m } from '$lib/paraglide/messages'

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
				path: `/pages/${newSlug}`,
				title: newTitle,
				content: `# ${newTitle}\n\nWrite your page in Markdown.\n`,
				published: false,
			})
			if (error) throw new Error(typeof error.value === 'string' ? error.value : ((error.value as { error?: string })?.error ?? `Request failed (${error.status})`))
			toast.success(m.admin_pages_created())
			newSlug = ''
			newTitle = ''
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
			if (error) throw new Error(typeof error.value === 'string' ? error.value : ((error.value as { error?: string })?.error ?? `Request failed (${error.status})`))
			await load()
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.admin_pages_action_failed())
		}
	}

	async function remove(p: AdminPage) {
		if (!confirm(m.admin_pages_confirm_delete({ slug: p.slug }))) return
		try {
			const { error } = await eden.api.admin.pages({ slug: p.slug }).delete()
			if (error) throw new Error(typeof error.value === 'string' ? error.value : ((error.value as { error?: string })?.error ?? `Request failed (${error.status})`))
			toast.success(m.admin_pages_deleted())
			await load()
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.admin_pages_action_failed())
		}
	}
</script>

<header class="space-y-1">
	<h1 class="text-2xl font-semibold tracking-tight">{m.admin_pages_title()}</h1>
	<p class="text-sm text-muted-foreground">{m.admin_pages_subtitle_prefix()} <code class="font-mono">/pages/:slug</code>.</p>
</header>

<Card>
	<CardHeader>
		<CardTitle class="text-base">{m.admin_pages_all()}</CardTitle>
		<CardDescription>{m.admin_pages_count({ total: pages.length, published: pages.filter((p) => p.published).length })}</CardDescription>
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
							<Badge variant={p.published ? 'default' : 'secondary'} class="text-[10px]">{p.published ? m.admin_pages_published() : m.admin_pages_draft()}</Badge>
							{#if p.showInFooter}<Badge variant="outline" class="text-[10px]">{m.admin_pages_footer()}</Badge>{/if}
							{#if p.path === '/'}<Badge variant="default" class="text-[10px]">{m.admin_pages_homepage()}</Badge>{/if}
						</div>
						<div class="text-xs text-muted-foreground font-mono truncate">
							<span class="text-foreground">{p.path}</span>
							<span class="opacity-50"> · slug:{p.slug}</span>
						</div>
					</div>
					<div class="flex items-center gap-1 flex-shrink-0">
						<Button variant="ghost" size="sm" onclick={() => togglePublish(p)} aria-label={p.published ? m.admin_pages_unpublish() : m.admin_pages_publish()}>
							{#if p.published}<EyeOff class="h-3.5 w-3.5" />{:else}<Eye class="h-3.5 w-3.5" />{/if}
						</Button>
						<Button variant="ghost" size="sm" href={`/admin/pages/${p.slug}`} aria-label={m.admin_pages_edit()}>
							<Edit class="h-3.5 w-3.5" />
						</Button>
						<Button variant="ghost" size="sm" onclick={() => remove(p)} aria-label={m.admin_pages_delete()}>
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
				<Label for="new-slug">Slug</Label>
				<div class="flex items-stretch rounded-md border border-input bg-card overflow-hidden focus-within:ring-2 focus-within:ring-ring">
					<span class="inline-flex items-center px-2 text-xs text-muted-foreground font-mono bg-muted/40 border-r border-input">/pages/</span>
					<input
						id="new-slug"
						bind:value={newSlug}
						placeholder="changelog"
						pattern="[a-z0-9][a-z0-9-]*"
						required
						class="flex-1 bg-transparent px-2 text-sm outline-none"
					/>
				</div>
				<p class="text-xs text-muted-foreground">Lowercase letters, digits, hyphens. Published at <code class="font-mono">/pages/{newSlug || '<slug>'}</code>.</p>
			</div>
			<div class="grid gap-2">
				<Label for="new-title">{m.admin_pages_title_field()}</Label>
				<Input id="new-title" bind:value={newTitle} required maxlength={120} />
			</div>
			<Button type="submit" disabled={busy} size="sm">
				<Plus class="h-3.5 w-3.5" />
				{busy ? m.admin_pages_creating() : m.admin_pages_create_button()}
			</Button>
		</form>
	</CardContent>
</Card>
