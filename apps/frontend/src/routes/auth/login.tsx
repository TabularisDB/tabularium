import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Github } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export const Route = createFileRoute('/auth/login')({
  component: LoginPage,
})

const BACKEND_URL = import.meta.env.DEV ? 'http://localhost:3000' : ''

function LoginPage() {
  const [forgejo, setForgejo] = useState('')

  const goCodeberg = () => {
    window.location.href = `${BACKEND_URL}/auth/gitea?instance=${encodeURIComponent('https://codeberg.org')}`
  }
  const goForgejo = () => {
    const url = forgejo.trim().replace(/\/$/, '')
    if (!url.startsWith('http')) return
    window.location.href = `${BACKEND_URL}/auth/gitea?instance=${encodeURIComponent(url)}`
  }
  const goGithub = () => {
    window.location.href = `${BACKEND_URL}/auth/github`
  }

  return (
    <div className="mx-auto max-w-md px-6 py-20 space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Sign in</h1>
        <p className="text-sm text-muted-foreground">
          Sign in to submit plugins and upvote requests.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Choose a provider</CardTitle>
          <CardDescription>
            We support GitHub, Codeberg, and any self-hosted Forgejo/Gitea instance.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button onClick={goGithub} className="w-full justify-start">
            <Github className="h-4 w-4" />
            Continue with GitHub
          </Button>

          <Button onClick={goCodeberg} variant="outline" className="w-full justify-start">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
              <path d="M11.955.49A12 12 0 0 0 0 12.49a12 12 0 0 0 1.832 6.373L11.946 5.78l10.226 13.067A12 12 0 0 0 24 12.49a12 12 0 0 0-12-12 12 12 0 0 0-.045 0z"/>
            </svg>
            Continue with Codeberg
          </Button>

          <div className="pt-3 mt-3 border-t border-border space-y-2">
            <Label htmlFor="forgejo" className="text-xs uppercase tracking-wider text-muted-foreground">
              Custom Forgejo / Gitea
            </Label>
            <div className="flex gap-2">
              <Input
                id="forgejo"
                placeholder="https://gitea.example.org"
                value={forgejo}
                onChange={(e) => setForgejo(e.target.value)}
              />
              <Button onClick={goForgejo} variant="outline" disabled={!forgejo.startsWith('http')}>
                Go
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground text-center">
        We use OAuth for sign-in. The registry only sees your username and a short-lived token
        used to verify repository ownership when you submit a plugin.
      </p>
    </div>
  )
}
