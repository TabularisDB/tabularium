<script lang="ts">
	type Props = {
		kind: 'github' | 'gitlab' | 'gitea'
		baseUrl: string
		logoUrl?: string | null
		class?: string
		alt?: string
	}

	let { kind, baseUrl, logoUrl, class: className = 'h-4 w-4', alt = '' }: Props = $props()

	function defaultSlug(): string {
		if (kind === 'github') return 'github'
		if (kind === 'gitlab') return 'gitlab'
		if (baseUrl.includes('codeberg.org')) return 'codeberg'
		return 'forgejo'
	}

	const src = $derived(logoUrl ?? `https://cdn.simpleicons.org/${defaultSlug()}`)
</script>

<img {src} alt={alt || kind} class={className} loading="lazy" decoding="async" />
