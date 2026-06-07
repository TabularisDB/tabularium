<script lang="ts">
	import Card from '$components/ui/Card.svelte'
	import CardContent from '$components/ui/CardContent.svelte'
	import CardDescription from '$components/ui/CardDescription.svelte'
	import CardHeader from '$components/ui/CardHeader.svelte'
	import CardTitle from '$components/ui/CardTitle.svelte'
	import Button from '$components/ui/Button.svelte'
	import Label from '$components/ui/Label.svelte'
	import Select from '$components/ui/Select.svelte'
	import type { EmailBucket, InvalidData, PreferenceData } from './Unsubscribe.load'

	type Props = { data: PreferenceData | InvalidData }
	let { data }: Props = $props()

	let prefs = $state<Record<string, EmailBucket>>({})
	$effect(() => {
		if (!data.invalid) prefs = { ...data.prefs }
	})

	let busy = $state(false)
	let banner = $state<{ kind: 'ok' | 'err'; text: string } | null>(null)

	function categoryLabel(key: string): string {
		switch (key) {
			case 'account':
				return 'Account & security'
			case 'owner_ops':
				return 'Plugin moderation (approval / rejection)'
			case 'plugin_updates':
				return 'Plugin updates you subscribed to'
			case 'newsletter':
				return 'Tabularium newsletter'
			default:
				return key
		}
	}

	function categoryDescription(key: string): string {
		switch (key) {
			case 'account':
				return 'Sign-up confirmation, password resets, security alerts.'
			case 'owner_ops':
				return 'When your plugin is approved or needs changes.'
			case 'plugin_updates':
				return 'New releases for the plugins you watch.'
			case 'newsletter':
				return 'Occasional product news, opt-in only.'
			default:
				return ''
		}
	}

	async function save() {
		if (data.invalid) return
		busy = true
		banner = null
		try {
			const res = await fetch(`/email/preferences/${data.token}`, {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ prefs }),
			})
			if (!res.ok) {
				banner = {
					kind: 'err',
					text: 'Could not save preferences. The link may have expired.',
				}
				return
			}
			const out = (await res.json()) as { ok: boolean; prefs: Record<string, EmailBucket> }
			prefs = { ...out.prefs }
			banner = { kind: 'ok', text: 'Preferences saved.' }
		} catch {
			banner = { kind: 'err', text: 'Could not save preferences. Please try again.' }
		} finally {
			busy = false
		}
	}

	async function unsubscribeAll() {
		if (data.invalid) return
		const optInKeys = data.categories.filter((c) => c.optIn).map((c) => c.key)
		const next = { ...prefs }
		for (const k of optInKeys) next[k] = 'off'
		prefs = next
		await save()
	}
</script>

{#if data.invalid}
	<div class="mx-auto max-w-md py-16 text-center space-y-4">
		<h1 class="text-2xl font-semibold tracking-tight">This link has expired</h1>
		<p class="text-sm text-muted-foreground">Sign in to your account to update your email preferences.</p>
		<div class="pt-2">
			<Button href="/login?returnTo=/settings/email">Sign in to manage preferences</Button>
		</div>
	</div>
{:else}
	<div class="mx-auto max-w-2xl py-10 space-y-6 px-4">
		<header class="space-y-2">
			<h1 class="text-2xl font-semibold tracking-tight">Email preferences</h1>
			<p class="text-sm text-muted-foreground">
				Updating preferences for
				<span class="font-medium text-foreground">{data.email ?? 'your account'}</span>.
			</p>
		</header>

		{#if banner}
			<div
				class={[
					'rounded-md border px-4 py-3 text-sm',
					banner.kind === 'ok'
						? 'border-success/40 bg-success/10 text-success-foreground'
						: 'border-destructive/40 bg-destructive/10 text-destructive-foreground',
				].join(' ')}
				role="status"
				aria-live="polite"
			>
				{banner.text}
			</div>
		{/if}

		<Card>
			<CardHeader>
				<CardTitle class="text-base">Notification categories</CardTitle>
				<CardDescription>
					Choose how often you'd like to receive each kind of email. Pick "Off" to stop a category entirely.
				</CardDescription>
			</CardHeader>
			<CardContent class="space-y-3">
				{#each data.categories as cat (cat.key)}
					<div
						class="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-card px-4 py-3"
					>
						<div class="space-y-0.5 min-w-0 flex-1">
							<Label for={`cat-${cat.key}`} class="text-sm font-medium">
								{categoryLabel(cat.key)}
							</Label>
							<p class="text-xs text-muted-foreground">{categoryDescription(cat.key)}</p>
						</div>
						{#if cat.optIn}
							<Select
								id={`cat-${cat.key}`}
								bind:value={prefs[cat.key]}
								disabled={busy}
								class="h-9 w-auto min-w-[10rem]"
							>
								<option value="instant">Instant</option>
								<option value="daily">Daily digest</option>
								<option value="weekly">Weekly digest</option>
								<option value="off">Off</option>
							</Select>
						{:else}
							<span class="text-xs italic text-muted-foreground whitespace-nowrap">Always on</span>
						{/if}
					</div>
				{/each}
				<p class="text-xs text-muted-foreground pt-1">
					Account and security messages can't be turned off — you'll always receive them.
				</p>
			</CardContent>
		</Card>

		<div class="flex flex-wrap items-center gap-3">
			<Button onclick={save} disabled={busy}>
				{busy ? 'Saving…' : 'Save preferences'}
			</Button>
			<Button variant="outline" onclick={unsubscribeAll} disabled={busy}>Unsubscribe from all opt-in mail</Button>
		</div>
	</div>
{/if}
