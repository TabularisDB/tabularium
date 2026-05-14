<script lang="ts">
	let { html, container = 'prose' }: { html: string; container?: 'prose' | 'plain' } = $props()
</script>

<div class={container === 'prose' ? 'prose prose-sm dark:prose-invert max-w-none' : ''}>
	{@html html}
</div>
