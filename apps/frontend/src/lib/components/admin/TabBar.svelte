<script lang="ts" generics="T extends string">
	import type { Component } from 'svelte'
	import { cn } from '$lib/utils'

	type Tab = {
		id: T
		label: string
		icon?: Component
		badge?: number | string
	}

	type Props = {
		tabs: Tab[]
		active: T
		onChange?: (id: T) => void
		class?: string
		size?: 'sm' | 'md'
	}

	let { tabs, active = $bindable(), onChange, class: className, size = 'md' }: Props = $props()

	function pick(id: T) {
		active = id
		onChange?.(id)
	}
</script>

<div
	role="tablist"
	class={cn(
		'inline-flex rounded-md border border-border bg-card/50 p-0.5 shrink-0',
		size === 'sm' ? 'text-xs' : 'text-sm',
		className,
	)}
>
	{#each tabs as tab (tab.id)}
		{@const Icon = tab.icon}
		<button
			type="button"
			role="tab"
			aria-selected={active === tab.id}
			class={cn(
				'inline-flex items-center gap-1.5 rounded transition-colors',
				size === 'sm' ? 'px-2.5 py-1' : 'px-3 py-1.5',
				active === tab.id
					? 'bg-accent text-foreground'
					: 'text-muted-foreground hover:text-foreground',
			)}
			onclick={() => pick(tab.id)}
		>
			{#if Icon}
				<Icon class={size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
			{/if}
			<span>{tab.label}</span>
			{#if tab.badge !== undefined && tab.badge !== null && tab.badge !== 0}
				<span
					class={cn(
						'inline-flex items-center justify-center rounded-full bg-muted px-1.5 font-mono text-[10px]',
						size === 'sm' ? 'h-4 min-w-[1rem]' : 'h-4 min-w-[1.125rem]',
						active === tab.id ? 'bg-primary/20 text-foreground' : 'text-muted-foreground',
					)}
				>
					{tab.badge}
				</span>
			{/if}
		</button>
	{/each}
</div>
