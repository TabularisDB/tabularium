import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Check, Minus, ExternalLink } from 'lucide-react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { CodeBlock } from '@/components/code-block'

export const Route = createFileRoute('/plugins/$slug')({
  component: PluginDetailPage,
})

type Release = {
  id: string
  pluginId: string
  version: string
  minTabularisVersion: string | null
  assets: Record<string, string>
  createdAt: number
}

type PluginDetail = {
  id: string
  ownerId: string
  name: string
  description: string
  author: string
  repoUrl: string
  homepage: string
  latestVersion: string | null
  createdAt: number
  updatedAt: number
  releases: Release[]
}

const PLATFORM_LABELS: Array<[string, string]> = [
  ['linux-x64', 'Linux x64'],
  ['linux-arm64', 'Linux arm64'],
  ['darwin-x64', 'macOS Intel'],
  ['darwin-arm64', 'macOS Apple Silicon'],
  ['win-x64', 'Windows x64'],
  ['universal', 'Universal'],
]

function PluginDetailPage() {
  const { slug } = Route.useParams()

  const query = useQuery<PluginDetail>({
    queryKey: ['plugin', slug],
    queryFn: async () => {
      const { data, error } = await (api as any).api.plugins({ slug }).get()
      if (error) throw error
      return data as PluginDetail
    },
  })

  if (query.isLoading) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-12 space-y-6">
        <Skeleton className="h-9 w-1/3" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-72 w-full" />
      </div>
    )
  }

  if (query.isError || !query.data) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-24 text-center space-y-4">
        <h1 className="text-2xl font-semibold">Plugin not found</h1>
        <p className="text-muted-foreground">No plugin with id <code className="font-mono">{slug}</code>.</p>
        <Button asChild variant="outline"><Link to="/plugins"><ArrowLeft className="h-4 w-4" />Back to plugins</Link></Button>
      </div>
    )
  }

  const plugin = query.data
  const sortedReleases = [...plugin.releases].sort((a, b) =>
    b.version.localeCompare(a.version, undefined, { numeric: true }),
  )

  return (
    <div className="mx-auto max-w-4xl px-6 py-10 space-y-10">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-3">
          <Link to="/plugins"><ArrowLeft className="h-3.5 w-3.5" />Plugins</Link>
        </Button>
      </div>

      <header className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">{plugin.name}</h1>
            <code className="text-sm text-muted-foreground font-mono mt-1.5 inline-block">{plugin.id}</code>
          </div>
          {plugin.latestVersion && (
            <Badge className="text-sm font-mono">v{plugin.latestVersion}</Badge>
          )}
        </div>
        <p className="text-base text-foreground/90 max-w-2xl">{plugin.description}</p>
        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          <span>By <span className="text-foreground">{plugin.author}</span></span>
          {plugin.homepage && (
            <a
              href={plugin.homepage}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 hover:text-foreground"
            >
              <ExternalLink className="h-3 w-3" />
              Repository
            </a>
          )}
        </div>
      </header>

      <section className="space-y-3">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold tracking-tight">Install</h2>
          <p className="text-sm text-muted-foreground">In Tabularis, open <strong>Settings → Available Plugins</strong> and click <strong>Install</strong> on this plugin.</p>
        </div>
      </section>

      {sortedReleases.length > 0 && (
        <section className="space-y-3">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold tracking-tight">Releases</h2>
            <p className="text-sm text-muted-foreground">Latest version is highlighted in the badge above. Older versions are still installable.</p>
          </div>
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-card/50">
                  <TableHead className="font-medium text-foreground">Version</TableHead>
                  <TableHead className="font-medium text-foreground">Min Tabularis</TableHead>
                  {PLATFORM_LABELS.map(([key, label]) => (
                    <TableHead key={key} className="text-center text-xs whitespace-nowrap font-medium text-foreground">
                      {label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedReleases.map((release) => (
                  <TableRow key={release.id}>
                    <TableCell className="font-mono">{release.version}</TableCell>
                    <TableCell className="text-muted-foreground">{release.minTabularisVersion ?? '—'}</TableCell>
                    {PLATFORM_LABELS.map(([key]) => (
                      <TableCell key={key} className="text-center">
                        {release.assets[key] ? (
                          <Check className="h-4 w-4 inline text-primary" aria-label="supported" />
                        ) : (
                          <Minus className="h-4 w-4 inline text-muted-foreground/40" aria-label="not supported" />
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}

      <section className="space-y-3">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold tracking-tight">Direct download</h2>
          <p className="text-sm text-muted-foreground">CLI-friendly endpoint that returns the asset URL for a given platform.</p>
        </div>
        <CodeBlock>{`curl "https://registry.tabularis.dev/api/plugins/${plugin.id}/latest?os=linux&arch=x64"`}</CodeBlock>
      </section>
    </div>
  )
}
