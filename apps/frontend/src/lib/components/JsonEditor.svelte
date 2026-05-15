<script lang="ts">
	import { JSONEditor, Mode, type Content } from 'svelte-jsoneditor'
	import 'svelte-jsoneditor/themes/jse-theme-dark.css'
	import { mode } from 'mode-watcher'

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

<div
	class="json-editor-host"
	class:jse-theme-dark={mode.current === 'dark'}
	style="min-height: {minHeight};"
>
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
		font-size: 0.75rem;
	}
</style>
