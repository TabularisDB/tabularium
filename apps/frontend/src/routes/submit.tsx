import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { CheckCircle2, AlertCircle, Copy, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { CodeBlock } from '@/components/code-block'

export const Route = createFileRoute('/submit')({
  component: SubmitPage,
})

type SubmitSuccess = { slug: string; webhookSecret: string; webhookUrl: string }

const metadataSchema = z.object({
  repoUrl: z.string().url('Must be a valid URL'),
  name: z.string().min(2).max(80),
  description: z.string().min(10).max(300),
})
type MetadataForm = z.infer<typeof metadataSchema>

function SubmitPage() {
  const [success, setSuccess] = useState<SubmitSuccess | null>(null)

  if (success) return <SuccessView result={success} onAnother={() => setSuccess(null)} />

  return (
    <div className="mx-auto max-w-2xl px-6 py-12 space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Submit a plugin</h1>
        <p className="text-muted-foreground">
          Two ways to prove you own the repo. Pick whichever fits your setup.
        </p>
      </header>

      <Tabs defaultValue="oauth">
        <TabsList>
          <TabsTrigger value="oauth">Sign in with provider</TabsTrigger>
          <TabsTrigger value="challenge">Manual challenge</TabsTrigger>
        </TabsList>
        <TabsContent value="oauth" className="pt-2">
          <OAuthPath onSuccess={setSuccess} />
        </TabsContent>
        <TabsContent value="challenge" className="pt-2">
          <ChallengePath onSuccess={setSuccess} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function OAuthPath({ onSuccess }: { onSuccess: (r: SubmitSuccess) => void }) {
  const { data: user, isLoading } = useAuth()
  const form = useForm<MetadataForm>({
    resolver: zodResolver(metadataSchema),
    defaultValues: { repoUrl: '', name: '', description: '' },
  })

  const submit = useMutation({
    mutationFn: async (values: MetadataForm) => {
      const { data, error } = await (api as any).api.submit.oauth.post(values)
      if (error) throw error
      return data as SubmitSuccess
    },
    onSuccess,
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to submit'),
  })

  if (isLoading) {
    return <Card><CardContent className="p-6 text-sm text-muted-foreground">Loading…</CardContent></Card>
  }

  if (!user) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sign in first</CardTitle>
          <CardDescription>
            OAuth-based submission requires you to be signed in with the same provider that owns the repo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild><Link to="/auth/login">Sign in</Link></Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Submit via {user.provider}</CardTitle>
        <CardDescription>
          Signed in as <strong className="text-foreground">{user.username}</strong>. We'll verify repo ownership against the {user.provider} API.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={form.handleSubmit((v) => submit.mutate(v))}>
          <div className="space-y-2">
            <Label htmlFor="repoUrl">Repository URL</Label>
            <Input id="repoUrl" placeholder="https://github.com/your/tabularis-plugin" {...form.register('repoUrl')} />
            {form.formState.errors.repoUrl && <p className="text-xs text-destructive">{form.formState.errors.repoUrl.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="name">Display name</Label>
            <Input id="name" placeholder="My Plugin" {...form.register('name')} />
            {form.formState.errors.name && <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Short description</Label>
            <Textarea id="description" rows={3} {...form.register('description')} />
            {form.formState.errors.description && <p className="text-xs text-destructive">{form.formState.errors.description.message}</p>}
          </div>
          <Button type="submit" disabled={submit.isPending}>
            {submit.isPending ? 'Submitting…' : 'Submit plugin'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

function ChallengePath({ onSuccess }: { onSuccess: (r: SubmitSuccess) => void }) {
  const [token, setToken] = useState<string | null>(null)
  const [repoUrl, setRepoUrl] = useState('')
  const { data: user } = useAuth()

  const startSchema = z.object({ repoUrl: z.string().url() })
  const startForm = useForm<{ repoUrl: string }>({
    resolver: zodResolver(startSchema),
    defaultValues: { repoUrl: '' },
  })

  const startMutation = useMutation({
    mutationFn: async (values: { repoUrl: string }) => {
      const { data, error } = await (api as any).api.submit.challenge.post(values)
      if (error) throw error
      return data as { token: string; instructions: string }
    },
    onSuccess: (data, values) => {
      setToken(data.token)
      setRepoUrl(values.repoUrl)
    },
    onError: () => toast.error('Could not start challenge'),
  })

  const verifyForm = useForm<{ name: string; description: string }>({
    resolver: zodResolver(
      z.object({
        name: z.string().min(2).max(80),
        description: z.string().min(10).max(300),
      }),
    ),
    defaultValues: { name: '', description: '' },
  })

  const verifyMutation = useMutation({
    mutationFn: async (values: { name: string; description: string }) => {
      if (!token) throw new Error('Missing token')
      const { data, error } = await (api as any).api.submit.challenge.verify.post(values, {
        query: { token },
      })
      if (error) throw error
      return data as SubmitSuccess
    },
    onSuccess,
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Verification failed'),
  })

  if (!token) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Generate a challenge token</CardTitle>
          <CardDescription>
            We'll give you a token to place in your repo at <code className="font-mono">.tabularis</code> (plain text)
            or <code className="font-mono">tabularis.json</code> (as a JSON field).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={startForm.handleSubmit((v) => startMutation.mutate(v))}>
            <div className="space-y-2">
              <Label htmlFor="challengeRepoUrl">Repository URL</Label>
              <Input id="challengeRepoUrl" placeholder="https://github.com/your/repo" {...startForm.register('repoUrl')} />
              {startForm.formState.errors.repoUrl && (
                <p className="text-xs text-destructive">{startForm.formState.errors.repoUrl.message}</p>
              )}
            </div>
            <Button type="submit" disabled={startMutation.isPending}>
              {startMutation.isPending ? 'Generating…' : 'Generate token'}
            </Button>
          </form>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Place the token, then verify</CardTitle>
        <CardDescription>
          Add the token below to <code className="font-mono">.tabularis</code> at the root of{' '}
          <span className="text-foreground">{repoUrl}</span>, on <code className="font-mono">main</code> or{' '}
          <code className="font-mono">master</code>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <CodeBlock>{token}</CodeBlock>
        <p className="text-xs text-muted-foreground">
          Or place <code className="font-mono">{`{"tabularis_token":"${token}"}`}</code> in <code className="font-mono">tabularis.json</code>.
        </p>

        {!user ? (
          <Card className="bg-card/50">
            <CardContent className="p-4 text-sm flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 text-muted-foreground" />
              <div>
                You need to <Link to="/auth/login" className="text-primary hover:underline">sign in</Link> before verifying — the plugin will be owned by your account.
              </div>
            </CardContent>
          </Card>
        ) : (
          <form
            className="space-y-4 pt-4 border-t border-border"
            onSubmit={verifyForm.handleSubmit((v) => verifyMutation.mutate(v))}
          >
            <div className="space-y-2">
              <Label htmlFor="vName">Display name</Label>
              <Input id="vName" {...verifyForm.register('name')} />
              {verifyForm.formState.errors.name && (
                <p className="text-xs text-destructive">{verifyForm.formState.errors.name.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="vDescription">Description</Label>
              <Textarea id="vDescription" rows={3} {...verifyForm.register('description')} />
              {verifyForm.formState.errors.description && (
                <p className="text-xs text-destructive">{verifyForm.formState.errors.description.message}</p>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={verifyMutation.isPending}>
                {verifyMutation.isPending ? 'Verifying…' : 'I placed it — verify'}
              </Button>
              <Button type="button" variant="ghost" onClick={() => { setToken(null); startForm.reset() }}>
                Start over
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  )
}

function SuccessView({ result, onAnother }: { result: SubmitSuccess; onAnother: () => void }) {
  return (
    <div className="mx-auto max-w-2xl px-6 py-12 space-y-8">
      <div className="flex items-center gap-3">
        <CheckCircle2 className="h-8 w-8 text-primary" />
        <h1 className="text-3xl font-semibold tracking-tight">Plugin registered</h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Webhook secret</CardTitle>
          <CardDescription>
            <strong className="text-foreground">Copy this now.</strong> It's shown once — the registry doesn't keep
            a recoverable copy. Add it to a webhook on your repo so we receive release events.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Webhook URL</Label>
            <CodeBlock>{result.webhookUrl}</CodeBlock>
          </div>
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Webhook secret</Label>
            <CodeBlock>{result.webhookSecret}</CodeBlock>
          </div>
          <div className="pt-2 flex flex-wrap gap-2">
            <Button asChild>
              <Link to="/plugins/$slug" params={{ slug: result.slug }}>
                View plugin page
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                navigator.clipboard.writeText(result.webhookSecret)
                toast.success('Copied webhook secret')
              }}
            >
              <Copy className="h-3.5 w-3.5" />
              Copy secret
            </Button>
            <Button variant="ghost" onClick={onAnother}>Submit another</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
