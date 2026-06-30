<script lang="ts">
	import FileCode2 from '@lucide/svelte/icons/file-code-2'
	import AdminPageHeader from '$components/admin/AdminPageHeader.svelte'
	import { m } from '$lib/paraglide/messages'
	import Manifest from '../tabs/Manifest.svelte'
</script>

<AdminPageHeader title={m.admin_instance_tab_manifest()} subtitle={m.admin_instance_manifest_subtitle()} icon={FileCode2} />

<Manifest />
