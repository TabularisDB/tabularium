<script lang="ts">
	import Badge from '$components/ui/Badge.svelte'
	import { m } from '$lib/paraglide/messages'

	type FieldDoc = {
		key: string
		type: string
		required: boolean
		description: string | null
		enumValues?: string[]
		format?: string
		deprecated?: boolean
	}

	let { fields }: { fields: FieldDoc[] } = $props()
</script>

<div class="overflow-x-auto rounded-md border border-border">
	<table class="w-full text-sm">
		<thead class="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
			<tr>
				<th class="text-left px-3 py-2 font-medium">Field</th>
				<th class="text-left px-3 py-2 font-medium">{m.docs_field_type()}</th>
				<th class="text-left px-3 py-2 font-medium"></th>
				<th class="text-left px-3 py-2 font-medium">Description</th>
			</tr>
		</thead>
		<tbody>
			{#each fields as f (f.key)}
				<tr class="border-t border-border">
					<td class="px-3 py-2 font-mono text-xs align-top">{f.key}</td>
					<td class="px-3 py-2 font-mono text-xs text-muted-foreground align-top">
						{f.type}{#if f.format}<span class="text-muted-foreground/70"> · {f.format}</span>{/if}
					</td>
					<td class="px-3 py-2 align-top">
						{#if f.required}
							<Badge variant="default">{m.docs_field_required()}</Badge>
						{:else}
							<Badge variant="outline">{m.docs_field_optional()}</Badge>
						{/if}
						{#if f.deprecated}
							<Badge variant="destructive" class="ml-1">{m.docs_field_deprecated()}</Badge>
						{/if}
					</td>
					<td class="px-3 py-2 text-muted-foreground align-top">
						{f.description ?? '—'}
						{#if f.enumValues && f.enumValues.length > 0}
							<div class="mt-1 flex flex-wrap gap-1">
								{#each f.enumValues as v (v)}
									<code class="text-[10px] px-1.5 py-0.5 rounded bg-muted">{v}</code>
								{/each}
							</div>
						{/if}
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>
