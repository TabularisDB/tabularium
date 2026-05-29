<script lang="ts">
	import { onMount, onDestroy } from 'svelte'
	import { EditorState, type Extension, RangeSet, type Range } from '@codemirror/state'
	import {
		EditorView,
		keymap,
		highlightActiveLine,
		Decoration,
		type DecorationSet,
		ViewPlugin,
		type ViewUpdate,
	} from '@codemirror/view'
	import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
	import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
	import {
		syntaxTree,
		syntaxHighlighting,
		defaultHighlightStyle,
		HighlightStyle,
		indentOnInput,
	} from '@codemirror/language'
	import { tags as t } from '@lezer/highlight'

	type Props = {
		value: string
		placeholder?: string
		minRows?: number
		disabled?: boolean
	}

	let { value = $bindable(''), placeholder = '', minRows = 8, disabled = false }: Props = $props()

	let editorEl: HTMLDivElement | undefined = $state()
	let view: EditorView | undefined
	let internalChange = false

	const headingLine = [
		Decoration.line({ class: '!text-[1.65em] !font-bold !leading-tight pt-1.5' }),
		Decoration.line({ class: '!text-[1.4em] !font-bold !leading-snug' }),
		Decoration.line({ class: '!text-[1.2em] !font-semibold' }),
		Decoration.line({ class: '!text-[1.05em] !font-semibold' }),
		Decoration.line({ class: '!font-semibold uppercase tracking-wider' }),
		Decoration.line({ class: '!font-semibold !text-muted-foreground' }),
	]
	const blockquoteLine = Decoration.line({
		class: 'pl-3 border-l-[3px] border-primary/40 !text-muted-foreground italic',
	})
	const codeLine = Decoration.line({ class: 'font-mono bg-muted/50 text-[0.9em]' })
	const frontmatterLine = Decoration.line({ class: 'font-mono bg-muted/40 text-[0.85em]' })
	const frontmatterFenceLine = Decoration.line({ class: 'font-mono bg-muted/60 !text-muted-foreground text-[0.85em]' })
	const markMuted = Decoration.mark({ class: 'text-muted-foreground/60' })

	function buildDecorations(viewArg: EditorView): DecorationSet {
		const doc = viewArg.state.doc
		const decoratedLines = new Set<number>()
		const lineRanges: Array<Range<Decoration>> = []
		const markRanges: Array<Range<Decoration>> = []

		// Frontmatter at document head: --- ... ---
		const firstLine = doc.line(1)
		if (firstLine.text.trim() === '---') {
			let endLine = -1
			for (let n = 2; n <= doc.lines; n++) {
				if (doc.line(n).text.trim() === '---') {
					endLine = n
					break
				}
			}
			if (endLine !== -1) {
				for (let n = 1; n <= endLine; n++) {
					const ln = doc.line(n)
					const deco = n === 1 || n === endLine ? frontmatterFenceLine : frontmatterLine
					lineRanges.push(deco.range(ln.from))
					decoratedLines.add(n)
				}
			}
		}

		for (const { from, to } of viewArg.visibleRanges) {
			syntaxTree(viewArg.state).iterate({
				from,
				to,
				enter: (node) => {
					const name = node.name
					if (name.startsWith('ATXHeading') || name.startsWith('SetextHeading')) {
						const level = Number(name.replace(/\D/g, '')) || 1
						const idx = Math.min(Math.max(level, 1), 6) - 1
						const startLine = doc.lineAt(node.from)
						if (!decoratedLines.has(startLine.number)) {
							lineRanges.push(headingLine[idx].range(startLine.from))
							decoratedLines.add(startLine.number)
						}
					} else if (name === 'Blockquote') {
						const ln = doc.lineAt(node.from)
						const endLn = doc.lineAt(node.to)
						for (let n = ln.number; n <= endLn.number; n++) {
							if (decoratedLines.has(n)) continue
							const l = doc.line(n)
							lineRanges.push(blockquoteLine.range(l.from))
							decoratedLines.add(n)
						}
					} else if (name === 'FencedCode' || name === 'CodeBlock') {
						const ln = doc.lineAt(node.from)
						const endLn = doc.lineAt(node.to)
						for (let n = ln.number; n <= endLn.number; n++) {
							if (decoratedLines.has(n)) continue
							const l = doc.line(n)
							lineRanges.push(codeLine.range(l.from))
							decoratedLines.add(n)
						}
					} else if (
						name === 'HeaderMark' ||
						name === 'EmphasisMark' ||
						name === 'CodeMark' ||
						name === 'LinkMark' ||
						name === 'QuoteMark' ||
						name === 'ListMark'
					) {
						if (node.from < node.to) {
							markRanges.push(markMuted.range(node.from, node.to))
						}
					}
				},
			})
		}

		const all = [...lineRanges, ...markRanges]
		return RangeSet.of(all, true)
	}

	const richMarkdown = ViewPlugin.fromClass(
		class {
			decorations: DecorationSet
			constructor(viewArg: EditorView) {
				this.decorations = buildDecorations(viewArg)
			}
			update(u: ViewUpdate) {
				if (u.docChanged || u.viewportChanged || syntaxTree(u.startState) !== syntaxTree(u.state)) {
					this.decorations = buildDecorations(u.view)
				}
			}
		},
		{ decorations: (v) => v.decorations },
	)

	const cmTheme = EditorView.theme({
		'&': {
			fontSize: '14px',
			height: '100%',
			backgroundColor: 'transparent',
		},
		'.cm-content': {
			fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif',
			padding: '12px 14px',
			caretColor: 'hsl(var(--foreground))',
			lineHeight: '1.55',
		},
		'.cm-focused': { outline: 'none' },
		'.cm-line': { padding: '0 2px' },
		'.cm-activeLine': { backgroundColor: 'hsl(var(--muted) / 0.35)' },
		'.cm-line::selection, .cm-line ::selection, .cm-content::selection, .cm-content ::selection': {
			backgroundColor: 'hsl(var(--primary) / 0.55)',
			color: 'hsl(var(--primary-foreground))',
		},
		'.cm-selectionMatch': { backgroundColor: 'hsl(var(--primary) / 0.25)' },
		'.cm-cursor': { borderLeftColor: 'hsl(var(--foreground))' },
	})

	const mdHighlight = HighlightStyle.define([
		{ tag: t.strong, fontWeight: 'bold' },
		{ tag: t.emphasis, fontStyle: 'italic' },
		{ tag: [t.link, t.url], color: 'hsl(var(--primary))', textDecoration: 'underline' },
		{ tag: t.monospace, color: 'hsl(var(--primary))' },
		{ tag: t.heading, fontWeight: 'bold' },
		{ tag: t.list, color: 'hsl(var(--primary))' },
		{ tag: t.processingInstruction, color: 'hsl(var(--muted-foreground))' },
		{ tag: t.contentSeparator, color: 'hsl(var(--muted-foreground))' },
	])

	function makeExtensions(): Extension[] {
		return [
			highlightActiveLine(),
			history(),
			indentOnInput(),
			markdown({ base: markdownLanguage }),
			syntaxHighlighting(mdHighlight, { fallback: true }),
			syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
			richMarkdown,
			cmTheme,
			keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
			EditorView.lineWrapping,
			EditorState.readOnly.of(disabled),
			EditorView.updateListener.of((u) => {
				if (!u.docChanged) return
				internalChange = true
				value = u.state.doc.toString()
			}),
		]
	}

	onMount(() => {
		if (!editorEl) return
		view = new EditorView({
			parent: editorEl,
			state: EditorState.create({ doc: value ?? '', extensions: makeExtensions() }),
		})
	})

	onDestroy(() => view?.destroy())

	$effect(() => {
		if (!view) return
		if (internalChange) {
			internalChange = false
			return
		}
		const current = view.state.doc.toString()
		if (current === value) return
		view.dispatch({ changes: { from: 0, to: current.length, insert: value ?? '' } })
	})
</script>

<div class="rounded-md border border-input bg-background overflow-hidden" class:opacity-50={disabled}>
	<div class="relative" style:min-height={`${minRows * 24}px`}>
		<div bind:this={editorEl} class="h-full"></div>
		{#if !value && placeholder}
			<div class="pointer-events-none absolute left-4 top-3 text-sm text-muted-foreground/60">
				{placeholder}
			</div>
		{/if}
	</div>
</div>
