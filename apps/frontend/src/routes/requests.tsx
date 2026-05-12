import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowUp, Plus, MessageSquarePlus } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'

export const Route = createFileRoute('/requests')({
  component: RequestsPage,
})

type PluginRequest = {
  id: string
  slug: string
  name: string
  description: string
  requesterId: string
  upvotes: number
  createdAt: number
}
type RequestsResponse = { total: number; page: number; limit: number; requests: PluginRequest[] }

const newRequestSchema = z.object({
  slug: z.string().min(2).max(40).regex(/^[a-z0-9-]+$/, 'lowercase letters, digits, hyphens'),
  name: z.string().min(2).max(80),
  description: z.string().min(10).max(500),
})
type NewRequestForm = z.infer<typeof newRequestSchema>

function RequestsPage() {
  const [sort, setSort] = useState<'upvotes' | 'recent'>('upvotes')
  const qc = useQueryClient()
  const { data: user } = useAuth()

  const listQuery = useQuery<RequestsResponse>({
    queryKey: ['requests', { sort }],
    queryFn: async () => {
      const { data, error } = await (api as any).api.requests.get({ query: { sort } })
      if (error) throw error
      return data as RequestsResponse
    },
  })

  const upvoteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await (api as any).api.requests({ id }).upvote.post()
      if (error) throw error
      return data as { upvotes: number; voted: boolean }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['requests'] }),
    onError: () => toast.error('Could not upvote — are you signed in?'),
  })

  const form = useForm<NewRequestForm>({
    resolver: zodResolver(newRequestSchema),
    defaultValues: { slug: '', name: '', description: '' },
  })

  const createMutation = useMutation({
    mutationFn: async (values: NewRequestForm) => {
      const { data, error } = await (api as any).api.requests.post(values)
      if (error) throw error
      return data
    },
    onSuccess: () => {
      toast.success('Request submitted')
      form.reset()
      qc.invalidateQueries({ queryKey: ['requests'] })
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : 'Failed to submit'
      toast.error(message)
    },
  })

  return (
    <div className="mx-auto max-w-4xl px-6 py-12 space-y-8">
      <header className="space-y-2">
        <div className="inline-flex items-center gap-2 text-xs text-muted-foreground">
          <MessageSquarePlus className="h-3.5 w-3.5" />
          Community wish list
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">Plugin requests</h1>
        <p className="text-muted-foreground">
          Suggest a plugin you want to see, or upvote others to signal demand.
        </p>
      </header>

      <Tabs defaultValue="browse">
        <TabsList>
          <TabsTrigger value="browse">Browse</TabsTrigger>
          <TabsTrigger value="new">
            <Plus className="h-3.5 w-3.5" />
            New request
          </TabsTrigger>
        </TabsList>

        <TabsContent value="browse" className="space-y-4 pt-2">
          <div className="flex items-center gap-2">
            <Label htmlFor="sort" className="text-sm text-muted-foreground">Sort by</Label>
            <select
              id="sort"
              value={sort}
              onChange={(e) => setSort(e.target.value as 'upvotes' | 'recent')}
              className="h-8 rounded-md border border-input bg-transparent px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="upvotes">Most upvotes</option>
              <option value="recent">Most recent</option>
            </select>
          </div>

          {listQuery.isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
            </div>
          ) : listQuery.data && listQuery.data.requests.length > 0 ? (
            <div className="space-y-3">
              {listQuery.data.requests.map((req) => (
                <Card key={req.id} className="bg-card/50">
                  <CardContent className="p-4 flex items-start gap-4">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex flex-col items-center justify-center h-auto py-2 px-3 min-w-[3.25rem]"
                      onClick={() => upvoteMutation.mutate(req.id)}
                      disabled={upvoteMutation.isPending || !user}
                      title={user ? 'Toggle upvote' : 'Sign in to vote'}
                    >
                      <ArrowUp className="h-4 w-4" />
                      <span className="text-xs font-mono tabular-nums">{req.upvotes}</span>
                    </Button>
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <h3 className="font-semibold text-foreground">{req.name}</h3>
                        <code className="text-xs text-muted-foreground font-mono">{req.slug}</code>
                      </div>
                      <p className="text-sm text-muted-foreground">{req.description}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border p-12 text-center text-muted-foreground">
              No requests yet — be the first.
            </div>
          )}
        </TabsContent>

        <TabsContent value="new" className="pt-2">
          {!user ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Sign in required</CardTitle>
                <CardDescription>
                  You need to be signed in before submitting a request.{' '}
                  <Link to="/auth/login" className="text-primary hover:underline">Sign in here</Link>.
                </CardDescription>
              </CardHeader>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Suggest a plugin</CardTitle>
                <CardDescription>Tell the community what you'd like to see built.</CardDescription>
              </CardHeader>
              <CardContent>
                <form
                  className="space-y-5"
                  onSubmit={form.handleSubmit((values) => createMutation.mutate(values))}
                >
                  <div className="space-y-2">
                    <Label htmlFor="slug">Slug</Label>
                    <Input id="slug" placeholder="mongo" {...form.register('slug')} />
                    {form.formState.errors.slug && (
                      <p className="text-xs text-destructive">{form.formState.errors.slug.message}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="name">Name</Label>
                    <Input id="name" placeholder="MongoDB" {...form.register('name')} />
                    {form.formState.errors.name && (
                      <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      rows={4}
                      placeholder="What kind of plugin would you like? Why is it useful?"
                      {...form.register('description')}
                    />
                    {form.formState.errors.description && (
                      <p className="text-xs text-destructive">{form.formState.errors.description.message}</p>
                    )}
                  </div>
                  <Button type="submit" disabled={createMutation.isPending}>
                    {createMutation.isPending ? 'Submitting…' : 'Submit request'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
