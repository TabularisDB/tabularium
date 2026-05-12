import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { api } from '@/lib/api'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { PluginCard } from '@/components/plugin-card'
import { Skeleton } from '@/components/ui/skeleton'

export const Route = createFileRoute('/plugins/')({
  component: PluginsListPage,
})

type PluginSummary = {
  id: string
  name: string
  description: string
  latestVersion: string | null
}
type PluginsResponse = { total: number; page: number; limit: number; plugins: PluginSummary[] }

function PluginsListPage() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const limit = 12

  const query = useQuery<PluginsResponse>({
    queryKey: ['plugins', { search, page, limit }],
    queryFn: async () => {
      const { data, error } = await (api as any).api.plugins.get({
        query: { search, page: String(page), limit: String(limit) },
      })
      if (error) throw error
      return data as PluginsResponse
    },
    placeholderData: keepPreviousData,
  })

  const totalPages = query.data ? Math.max(1, Math.ceil(query.data.total / limit)) : 1

  return (
    <div className="mx-auto max-w-6xl px-6 py-12 space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Plugins</h1>
        <p className="text-muted-foreground">
          Browse {query.data?.total ?? '…'} plugins published to the registry.
        </p>
      </header>

      <div className="relative max-w-xl">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(1)
          }}
          placeholder="Search by name, id, or description…"
          className="pl-9 h-10"
        />
      </div>

      {query.isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-lg" />
          ))}
        </div>
      ) : query.data && query.data.plugins.length > 0 ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {query.data.plugins.map((p) => (
              <PluginCard key={p.id} plugin={p} />
            ))}
          </div>
          {totalPages > 1 && (
            <nav className="flex items-center justify-center gap-2 pt-2" aria-label="Pagination">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <span className="text-sm text-muted-foreground tabular-nums">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </nav>
          )}
        </>
      ) : (
        <div className="rounded-lg border border-dashed border-border p-12 text-center text-muted-foreground">
          No plugins match your search.
        </div>
      )}
    </div>
  )
}
