<script lang="ts">
	import { Dialog } from 'bits-ui'
	import Hammer from '@lucide/svelte/icons/hammer'
	import ExternalLink from '@lucide/svelte/icons/external-link'
	import KeyRound from '@lucide/svelte/icons/key-round'
	import Button from '$components/ui/Button.svelte'
	import CodeBlock from '$components/ui/CodeBlock.svelte'
	import Input from '$components/ui/Input.svelte'
	import Label from '$components/ui/Label.svelte'
	import Select from '$components/ui/Select.svelte'
	import { eden } from '$lib/eden'
	import { m } from '$lib/paraglide/messages'
	import type { PluginRequest, RequestClaimer } from '$lib/types'

	type Props = {
		request: PluginRequest
		onClose: () => void
		onScaffolded: (claimers: RequestClaimer[]) => void
	}
	type ScaffoldResult = {
		repoUrl: string
		fullName: string
		submitUrl: string
		claimers: RequestClaimer[]
		linked?: boolean
	}
	type ScaffoldError = { error?: string; reauthUrl?: string; hint?: string }
	type Owner = { login: string; type: 'user' | 'org' }
	type Repo = { fullName: string; url: string }

	let { request, onClose, onScaffolded }: Props = $props()

	let open = $state(true)
	// The dialog is mounted per request, so the initial slug is the right default.
	// svelte-ignore state_referenced_locally
	let repoName = $state(request.slug)
	let owner = $state('')
	let owners = $state<Owner[] | null>(null)
	let mode = $state<'create' | 'link'>('create')
	let linkUrl = $state('')
	let repos = $state<Repo[]>([])
	let isPrivate = $state(false)
	let dbType = $state<'network' | 'file' | 'folder' | 'api'>('network')
	let withUi = $state(false)
	let minRuntimeVersion = $state('')
	let busy = $state(false)
	let error = $state<ScaffoldError | null>(null)
	let result = $state<ScaffoldResult | null>(null)

	const isTheme = $derived(request.kind === 'theme')
	const localCommand = $derived(
		isTheme
			? `npx --package @tabularis/create-plugin tabularis-theme scaffold ${request.slug} --dir ${request.slug} --min-runtime-version <version>`
			: `npm create @tabularis/plugin@latest ${request.slug}`,
	)

	$effect(() => {
		if (!open) onClose()
	})

	// Accounts the user can create the repository in; falls back to a free-text field.
	async function loadOwners() {
		try {
			const { data, error: err } = await eden.api.submit.owners.get({ query: {} })
			if (!err) owners = (data as { owners: Owner[] }).owners
		} catch {
			// Keep the free-text field.
		}
	}
	$effect(() => {
		loadOwners()
	})

	// Repositories the user maintains, as suggestions for the link field.
	let reposLoaded = false
	async function loadRepos() {
		if (reposLoaded) return
		reposLoaded = true
		try {
			const { data, error: err } = await eden.api.submit.repos.get({ query: { page: 1 } })
			if (err) throw err
			const { groups } = data as { groups: Array<{ repos: Repo[] }> }
			repos = groups.flatMap((g) => g.repos.map((r) => ({ fullName: r.fullName, url: r.url })))
		} catch {
			reposLoaded = false
		}
	}

	function setMode(next: 'create' | 'link') {
		mode = next
		error = null
		if (next === 'link') loadRepos()
	}

	async function link(e: SubmitEvent) {
		e.preventDefault()
		busy = true
		error = null
		try {
			const { data, error: err } = await eden.api.requests({ id: request.id }).repo.post({
				repoUrl: linkUrl.trim(),
				returnTo: window.location.href,
			})
			if (err) {
				error =
					typeof err.value === 'object' && err.value
						? (err.value as ScaffoldError)
						: { error: `Request failed (${err.status})` }
				return
			}
			result = { ...(data as ScaffoldResult), linked: true }
			onScaffolded(result.claimers)
		} catch (e) {
			error = { error: e instanceof Error ? e.message : String(e) }
		} finally {
			busy = false
		}
	}

	async function create(e: SubmitEvent) {
		e.preventDefault()
		busy = true
		error = null
		try {
			const { data, error: err } = await eden.api.requests({ id: request.id }).scaffold.post({
				repoName: repoName.trim() || undefined,
				owner: owner.trim() || undefined,
				private: isPrivate,
				...(isTheme ? { theme: { minRuntimeVersion: minRuntimeVersion.trim() } } : { driver: { dbType, withUi } }),
				returnTo: window.location.href,
			})
			if (err) {
				error =
					typeof err.value === 'object' && err.value
						? (err.value as ScaffoldError)
						: { error: `Request failed (${err.status})` }
				return
			}
			result = data as ScaffoldResult
			onScaffolded(result.claimers)
		} catch (e) {
			error = { error: e instanceof Error ? e.message : String(e) }
		} finally {
			busy = false
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Portal>
		<Dialog.Overlay class="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" />
		<Dialog.Content
			class="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-border bg-card p-6 shadow-2xl focus:outline-none"
		>
			<div class="flex items-start gap-3">
				<span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
					<Hammer class="h-5 w-5" />
				</span>
				<div class="min-w-0 flex-1">
					<Dialog.Title class="text-base font-semibold tracking-tight">
						{m.requests_scaffold_title({ name: request.name })}
					</Dialog.Title>
					<Dialog.Description class="mt-1.5 text-sm text-muted-foreground">
						{m.requests_scaffold_intro()}
					</Dialog.Description>
				</div>
			</div>

			{#if result}
				<div class="mt-5 space-y-4">
					<p class="text-sm">
						{result.linked
							? m.requests_scaffold_linked({ repo: result.fullName })
							: m.requests_scaffold_done({ repo: result.fullName })}
					</p>
					<p class="text-sm text-muted-foreground">{m.requests_scaffold_next()}</p>
					<div class="flex flex-wrap justify-end gap-2">
						<Button variant="outline" size="sm" href={result.repoUrl} target="_blank" rel="noopener noreferrer">
							<ExternalLink class="h-4 w-4" />
							{m.requests_scaffold_open_repo()}
						</Button>
						<Button size="sm" href={result.submitUrl}>{m.requests_scaffold_submit()}</Button>
					</div>
				</div>
			{:else}
				<div class="mt-5 grid grid-cols-2 gap-1 rounded-md border border-border p-1 text-sm" role="tablist">
					{#each [['create', m.requests_scaffold_mode_create()], ['link', m.requests_scaffold_mode_link()]] as [id, label] (id)}
						<button
							type="button"
							role="tab"
							aria-selected={mode === id}
							class="rounded px-3 py-1.5 transition-colors {mode === id
								? 'bg-primary/10 font-medium text-primary'
								: 'text-muted-foreground hover:text-foreground'}"
							onclick={() => setMode(id as 'create' | 'link')}
						>
							{label}
						</button>
					{/each}
				</div>
			{/if}

			{#if !result && mode === 'link'}
				<form class="mt-5 space-y-4" onsubmit={link}>
					<div class="space-y-2">
						<Label for="link-repo">{m.requests_scaffold_link_repo()}</Label>
						<Input
							id="link-repo"
							type="url"
							bind:value={linkUrl}
							list="link-repo-options"
							placeholder="https://github.com/owner/repo"
							autocomplete="off"
							class="font-mono"
							required
						/>
						<datalist id="link-repo-options">
							{#each repos as repo (repo.url)}
								<option value={repo.url}>{repo.fullName}</option>
							{/each}
						</datalist>
						<p class="text-xs text-muted-foreground">{m.requests_scaffold_link_hint()}</p>
					</div>

					{#if error}
						<div class="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm" role="alert">
							<p>{error.error}</p>
							{#if error.reauthUrl}
								<Button size="sm" href={error.reauthUrl}>
									<KeyRound class="h-4 w-4" />
									{m.requests_scaffold_grant()}
								</Button>
							{/if}
						</div>
					{/if}

					<div class="flex items-center justify-end gap-2">
						<Button variant="ghost" size="sm" type="button" onclick={() => (open = false)} disabled={busy}>
							{m.confirm_dialog_cancel()}
						</Button>
						<Button size="sm" type="submit" disabled={busy}>
							{busy ? m.requests_scaffold_linking() : m.requests_scaffold_link()}
						</Button>
					</div>
				</form>
			{:else if !result}
				<form class="mt-5 space-y-4" onsubmit={create}>
					<div class="grid gap-4 sm:grid-cols-2">
						<div class="space-y-2">
							<Label for="scaffold-repo">{m.requests_scaffold_repo_name()}</Label>
							<Input id="scaffold-repo" bind:value={repoName} maxlength={100} class="font-mono" required />
						</div>
						<div class="space-y-2">
							<Label for="scaffold-owner">{m.requests_scaffold_owner()}</Label>
							{#if owners}
								<Select id="scaffold-owner" bind:value={owner}>
									{#each owners as o, i (o.login)}
										<option value={i === 0 ? '' : o.login}>
											{i === 0 ? `${o.login} (${m.requests_scaffold_owner_hint()})` : o.login}
										</option>
									{/each}
								</Select>
							{:else}
								<Input
									id="scaffold-owner"
									bind:value={owner}
									maxlength={39}
									autocomplete="off"
									placeholder={m.requests_scaffold_owner_hint()}
								/>
							{/if}
						</div>
					</div>

					{#if isTheme}
						<div class="space-y-2">
							<Label for="scaffold-runtime">{m.requests_scaffold_min_runtime()}</Label>
							<Input
								id="scaffold-runtime"
								bind:value={minRuntimeVersion}
								placeholder="0.28.0"
								class="font-mono"
								required
							/>
						</div>
					{:else}
						<div class="space-y-2">
							<Label for="scaffold-db">{m.requests_scaffold_db_type()}</Label>
							<Select id="scaffold-db" bind:value={dbType}>
								<option value="network">{m.requests_scaffold_db_network()}</option>
								<option value="file">{m.requests_scaffold_db_file()}</option>
								<option value="folder">{m.requests_scaffold_db_folder()}</option>
								<option value="api">{m.requests_scaffold_db_api()}</option>
							</Select>
						</div>
						<label class="flex items-center gap-2 text-sm">
							<input type="checkbox" bind:checked={withUi} class="h-4 w-4 rounded border-border" />
							{m.requests_scaffold_with_ui()}
						</label>
					{/if}
					<label class="flex items-center gap-2 text-sm">
						<input type="checkbox" bind:checked={isPrivate} class="h-4 w-4 rounded border-border" />
						{m.requests_scaffold_private()}
					</label>

					{#if error}
						<div class="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm" role="alert">
							<p>{error.error}</p>
							{#if error.hint}<p class="text-muted-foreground">{error.hint}</p>{/if}
							{#if error.reauthUrl}
								<Button size="sm" href={error.reauthUrl}>
									<KeyRound class="h-4 w-4" />
									{m.requests_scaffold_grant()}
								</Button>
							{/if}
						</div>
					{/if}

					<div class="space-y-2">
						<p class="text-xs text-muted-foreground">{m.requests_scaffold_local()}</p>
						<CodeBlock value={localCommand} />
					</div>

					<div class="flex items-center justify-end gap-2">
						<Button variant="ghost" size="sm" type="button" onclick={() => (open = false)} disabled={busy}>
							{m.confirm_dialog_cancel()}
						</Button>
						<Button size="sm" type="submit" disabled={busy}>
							{busy ? m.requests_scaffold_creating() : m.requests_scaffold_create()}
						</Button>
					</div>
				</form>
			{/if}
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
