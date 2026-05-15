<script lang="ts">
	import { JSONEditor, Mode, type Content } from 'svelte-jsoneditor'

	type Props = {
		value: string
		readOnly?: boolean
		onchange?: (value: string, error: string | null) => void
		minHeight?: string
	}

	let { value = $bindable(), readOnly = false, onchange, minHeight = '14rem' }: Props = $props()

	let content = $state<Content>({ text: value || '' })

	$effect(() => {
		const current = (content as { text?: string }).text
		if (typeof value === 'string' && value !== current) {
			content = { text: value }
		}
	})

	function handleChange(next: Content) {
		content = next
		const c = next as { text?: string; json?: unknown }
		const text = c.text ?? (c.json !== undefined ? JSON.stringify(c.json, null, 2) : '')
		value = text
		let error: string | null = null
		try {
			if (text.trim()) JSON.parse(text)
		} catch (e) {
			error = e instanceof Error ? e.message : 'invalid JSON'
		}
		onchange?.(text, error)
	}
</script>

<div class="json-editor-host" style="min-height: {minHeight};">
	<JSONEditor
		bind:content
		{readOnly}
		mode={Mode.text}
		mainMenuBar={false}
		statusBar={true}
		navigationBar={false}
		onChange={handleChange}
	/>
</div>

<style>
	.json-editor-host :global(.jse-main) {
		min-height: inherit;
		--jse-theme-color: hsl(var(--card));
		--jse-background-color: hsl(var(--card));
		--jse-text-color: hsl(var(--foreground));
		--jse-panel-background: hsl(var(--card));
		--jse-panel-color: hsl(var(--foreground));
		--jse-key-color: hsl(var(--primary));
		--jse-value-color-string: hsl(var(--foreground));
		--jse-value-color-number: hsl(var(--primary));
		--jse-value-color-boolean: hsl(var(--primary));
		--jse-value-color-null: hsl(var(--muted-foreground));
		--jse-delimiter-color: hsl(var(--muted-foreground));
		--jse-error-color: hsl(var(--destructive));
		--jse-input-background: hsl(var(--card));
		--jse-border-radius: 0.375rem;
		font-size: 0.75rem;
	}
	.json-editor-host :global(.cm-editor) {
		background-color: hsl(var(--card)) !important;
	}
</style>
