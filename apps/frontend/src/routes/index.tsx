import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Boxes, Cable, Sparkles } from 'lucide-react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { PluginCard } from '@/components/plugin-card'
import { CodeBlock } from '@/components/code-block'
import { Skeleton } from '@/components/ui/skeleton'

export const Route = createFileRoute('/')({
  component: HomePage,
})

type PluginSummary = {
  id: string
  name: string
  description: string
  latestVersion: string | null
}
type PluginsResponse = { total: number; plugins: PluginSummary[] }

function HomePage() {
  const pluginsQuery = useQuery<PluginsResponse>({
    queryKey: ['plugins', 'top'],
    queryFn: async () => {
      const { data, error } = await (api as any).api.plugins.get({ query: { limit: '6' } })
      if (error) throw error
      return data as PluginsResponse
    },
  })

  return (
    <>
      {/* Hero */}
      <section className="hero-grid border-b border-border">
        <div className="mx-auto max-w-6xl px-6 py-24 sm:py-32 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground mb-8">
            <Sparkles className="h-3 w-3 text-primary" />
            Open registry · zero install for the app
          </div>
          <h1 className="text-4xl sm:text-6xl font-semibold tracking-tight text-foreground">
            The plugin index for{' '}
            <span className="text-primary">Tabularis</span>
          </h1>
          <p className="mt-6 text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto">
            Discover database drivers, data-source adapters, and UI extensions.
            Submit your own and ship updates straight from your release pipeline.
          </p>
          <div className="mt-10 flex items-center justify-center gap-3">
            <Button asChild size="lg">
              <Link to="/plugins">
                Browse plugins
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/submit">Submit a plugin</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Feature strip */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-6 py-12 grid gap-8 md:grid-cols-3">
          <FeatureCell
            icon={Cable}
            title="Built for the Tabularis app"
            body="The app fetches this registry directly — installs are a click away. No backend changes required on your side."
          />
          <FeatureCell
            icon={Boxes}
            title="GitHub & Codeberg friendly"
            body="Submit via OAuth or a manual challenge — works on GitHub, Codeberg, and any self-hosted Forgejo/Gitea."
          />
          <FeatureCell
            icon={Sparkles}
            title="Release-driven"
            body="Wire a webhook once. New tags automatically refresh the version table, no PRs required."
          />
        </div>
      </section>

      {/* Popular plugins */}
      <section>
        <div className="mx-auto max-w-6xl px-6 py-16 space-y-6">
          <div className="flex items-baseline justify-between">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Popular plugins</h2>
              <p className="text-sm text-muted-foreground mt-1">
                The most-installed plugins, refreshed continuously.
              </p>
            </div>
            <Link to="/plugins" className="text-sm text-primary hover:underline">
              See all →
            </Link>
          </div>
          {pluginsQuery.isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-36 rounded-lg" />
              ))}
            </div>
          ) : pluginsQuery.data && pluginsQuery.data.plugins.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {pluginsQuery.data.plugins.map((p) => (
                <PluginCard key={p.id} plugin={p} />
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">
              No plugins yet — be the first to{' '}
              <Link to="/submit" className="text-primary hover:underline">submit one</Link>.
            </div>
          )}
        </div>
      </section>

      {/* Install snippet */}
      <section className="border-t border-border bg-card/30">
        <div className="mx-auto max-w-6xl px-6 py-16 grid gap-8 lg:grid-cols-[1fr_1fr] items-center">
          <div className="space-y-3">
            <h2 className="text-2xl font-semibold tracking-tight">Point the app at this registry</h2>
            <p className="text-muted-foreground">
              In Tabularis, set <code className="font-mono text-foreground text-sm">custom_registry_url</code>{' '}
              in <code className="font-mono text-foreground text-sm">Settings → Advanced</code> to the URL below.
              Then every new release here shows up in the in-app plugin browser.
            </p>
          </div>
          <CodeBlock>https://registry.tabularis.dev</CodeBlock>
        </div>
      </section>
    </>
  )
}

function FeatureCell({
  icon: Icon,
  title,
  body,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  body: string
}) {
  return (
    <div className="space-y-2">
      <div className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <div className="font-medium text-foreground">{title}</div>
      <p className="text-sm text-muted-foreground">{body}</p>
    </div>
  )
}
