<script lang="ts">
	import ArrowRight from '@lucide/svelte/icons/arrow-right'
	import AppWindow from '@lucide/svelte/icons/app-window'
	import Download from '@lucide/svelte/icons/download'
	import ExternalLink from '@lucide/svelte/icons/external-link'
	import Button from '$components/ui/Button.svelte'
	import { branding } from '$lib/stores/branding.svelte'
	import { m } from '$lib/paraglide/messages'

	// Home-page pitch for the desktop app the plugins run in, after the
	// tabularis.dev "Plugins need the app first" closing CTA.
	const app = $derived(branding.companionApp)

	let videoBox = $state<HTMLDivElement | null>(null)
	let inView = $state(false)

	// Defer the (multi-MB) video until the player is near the viewport.
	$effect(() => {
		const el = videoBox
		if (!el || inView) return
		if (typeof IntersectionObserver === 'undefined') {
			inView = true
			return
		}
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((e) => e.isIntersecting)) {
					inView = true
					observer.disconnect()
				}
			},
			{ rootMargin: '300px' },
		)
		observer.observe(el)
		return () => observer.disconnect()
	})
</script>

{#if app.name}
	<section class="border-t border-border">
		<div
			class="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] gap-10 px-6 py-20 {app.videoUrl
				? 'lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-center'
				: 'justify-items-center text-center'}"
		>
			<div class="space-y-4 {app.videoUrl ? '' : 'flex max-w-2xl flex-col items-center'}">
				<div class="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
					<AppWindow class="h-3.5 w-3.5" />
					{m.app_home_eyebrow({ app: app.name })}
				</div>
				<h2 class="text-2xl font-semibold tracking-tight">{m.app_home_title()}</h2>
				<p class="text-muted-foreground">{m.app_home_body({ app: app.name })}</p>
				<div class="flex flex-wrap gap-3 pt-2 {app.videoUrl ? '' : 'justify-center'}">
					{#if app.downloadUrl}
						<Button href={app.downloadUrl} target="_blank" rel="noopener">
							<Download class="h-4 w-4" />
							{m.app_download({ app: app.name })}
						</Button>
					{/if}
					{#if app.url}
						<Button variant="outline" href={app.url} target="_blank" rel="noopener">
							{m.app_website({ app: app.name })}
							<ArrowRight class="h-4 w-4" />
						</Button>
					{/if}
				</div>
			</div>

			{#if app.videoUrl}
				<div
					bind:this={videoBox}
					class="video-frame overflow-hidden rounded-xl border border-border bg-card tabularis:rounded-lg tabularis:border-[0.1rem]"
				>
					<!-- svelte-ignore a11y_media_has_caption -->
					<video
						src={inView ? app.videoUrl : undefined}
						poster={app.videoPosterUrl ?? undefined}
						preload="none"
						controls
						muted
						playsinline
						loop
						autoplay
						controlslist="nodownload noremoteplayback noplaybackrate"
						disablepictureinpicture
						aria-label={app.name}
						class="block aspect-video h-auto w-full bg-black/40 object-cover"
					></video>
				</div>
				{#if app.url}
					<a
						href={app.url}
						target="_blank"
						rel="noopener"
						class="-mt-6 inline-flex items-center gap-1.5 justify-self-end text-xs text-muted-foreground transition-colors hover:text-foreground lg:col-start-2"
					>
						{new URL(app.url).host}
						<ExternalLink class="h-3 w-3" />
					</a>
				{/if}
			{/if}
		</div>
	</section>
{/if}

<style>
	.video-frame {
		box-shadow: 0 1.5rem 3rem -1rem rgb(0 0 0 / 0.5);
	}
	:global(:root:not(.dark)) .video-frame {
		box-shadow: 0 1.5rem 3rem -1rem rgb(15 23 42 / 0.2);
	}
</style>
