<script lang="ts">
	import { onMount } from 'svelte'
	import { page } from '$app/state'
	import { goto } from '$app/navigation'
	import { toast } from 'svelte-sonner'
	import Save from '@lucide/svelte/icons/save'
	import ArrowLeft from '@lucide/svelte/icons/arrow-left'
	import Card from '$components/ui/Card.svelte'
	import CardContent from '$components/ui/CardContent.svelte'
	import CardHeader from '$components/ui/CardHeader.svelte'
	import CardTitle from '$components/ui/CardTitle.svelte'
	import Button from '$components/ui/Button.svelte'
	import Input from '$components/ui/Input.svelte'
	import Label from '$components/ui/Label.svelte'
	import { Carta, MarkdownEditor } from 'carta-md'
	import 'carta-md/default.css'
	import { eden } from '$lib/eden'

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

	let title = $state('')
	let path = $state('')
	let content = $state('')
	let published = $state(false)
	let showInFooter = $state(false)
	let navOrder = $state<number | null>(null)
	let loading = $state(true)
	let saving = $state(false)

	const WIDGET_SNIPPETS: Array<{ label: string; snippet: string }> = [
		{ label: 'Featured plugins', snippet: '<tabularium-widget name="featured-plugins" limit="6" cols="3" />' },
		{ label: 'Recent plugins', snippet: '<tabularium-widget name="recent-plugins" limit="6" cols="3" />' },
		{ label: 'Popular plugins', snippet: '<tabularium-widget name="popular-plugins" limit="6" cols="3" />' },
		{ label: 'Plugin grid by category', snippet: '<tabularium-widget name="plugin-grid" category="databases" limit="6" cols="3" />' },
		{ label: 'Top requests', snippet: '<tabularium-widget name="popular-requests" limit="5" />' },
		{ label: 'Stats', snippet: '<tabularium-widget name="stats" />' },
	]

	function insertWidget(snippet: string) {
		content = `${content.replace(/\s*$/, '')}\n\n${snippet}\n`
	}

	const carta = new Carta({ sanitizer: false })

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
			toast.error(e instanceof Error ? e.message : 'Failed to load')
		} finally {
			loading = false
		}
	}

	onMount(load)

	async function save() {
		saving = true
		try {
			const { error } = await eden.api.admin.pages({ slug }).patch({
				title,
				path,
				content,
				published,
				showInFooter,
				navOrder,
			})
			if (error) throw new Error(typeof error.value === 'string' ? error.value : ((error.value as { error?: string })?.error ?? `Request failed (${error.status})`))
			toast.success('Saved')
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Failed to save')
		} finally {
			saving = false
		}
	}
</script>

<div class="flex items-center justify-between">
	<Button variant="ghost" size="sm" onclick={() => goto('/admin/pages')}>
		<ArrowLeft class="h-3.5 w-3.5" />
		Back
	</Button>
	{#if !loading}
		<Button size="sm" onclick={save} disabled={saving}>
			<Save class="h-3.5 w-3.5" />
			{saving ? 'Saving…' : 'Save'}
		</Button>
	{/if}
</div>

{#if loading}
	<p class="text-sm text-muted-foreground">Loading…</p>
{:else}
	<Card>
		<CardHeader>
			<CardTitle class="text-base">{slug}</CardTitle>
		</CardHeader>
		<CardContent class="space-y-4">
			<div class="grid gap-2">
				<Label for="title">Title</Label>
				<Input id="title" bind:value={title} maxlength={120} />
			</div>

			<div class="grid gap-2">
				<Label for="path">Public path</Label>
				<Input id="path" bind:value={path} placeholder="/about" />
				<p class="text-xs text-muted-foreground">
					<code class="font-mono">/</code> = homepage override. Otherwise any non-reserved URL (eg. <code class="font-mono">/docs/welcome</code>).
				</p>
			</div>

			<div class="flex items-center gap-4 flex-wrap">
				<label class="flex items-center gap-2 cursor-pointer text-sm">
					<input type="checkbox" bind:checked={published} class="h-4 w-4 rounded border-input" />
					<span>Published</span>
				</label>
				<label class="flex items-center gap-2 cursor-pointer text-sm">
					<input type="checkbox" bind:checked={showInFooter} class="h-4 w-4 rounded border-input" />
					<span>Show in footer</span>
				</label>
				<div class="flex items-center gap-2 text-sm">
					<Label for="nav-order" class="text-xs text-muted-foreground">Nav order</Label>
					<input
						id="nav-order"
						type="number"
						bind:value={navOrder}
						class="h-9 w-20 rounded-md border border-input bg-card px-2 text-sm"
					/>
				</div>
			</div>

			<div class="grid gap-2">
				<Label>Content (Markdown)</Label>
				<div class="flex flex-wrap items-center gap-1.5">
					<span class="text-xs text-muted-foreground mr-1">Insert widget:</span>
					{#each WIDGET_SNIPPETS as w (w.label)}
						<Button type="button" variant="ghost" size="sm" onclick={() => insertWidget(w.snippet)} class="text-xs">
							{w.label}
						</Button>
					{/each}
				</div>
				<div class="rounded-md border border-input overflow-hidden">
					<MarkdownEditor {carta} bind:value={content} mode="split" />
				</div>
				<p class="text-xs text-muted-foreground">
					GFM supported. Inline HTML allowed for <code class="font-mono">&lt;tabularium-widget /&gt;</code>. Output is sanitized server-side.
				</p>
			</div>
		</CardContent>
	</Card>
{/if}
