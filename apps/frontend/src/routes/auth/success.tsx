import { useEffect } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { CheckCircle2 } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Link } from '@tanstack/react-router'

export const Route = createFileRoute('/auth/success')({
  component: SuccessPage,
})

function SuccessPage() {
  const { data: user, isLoading } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (user) {
      const t = setTimeout(() => navigate({ to: '/' }), 1500)
      return () => clearTimeout(t)
    }
  }, [user, navigate])

  return (
    <div className="mx-auto max-w-md px-6 py-24 text-center space-y-6">
      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : user ? (
        <>
          <CheckCircle2 className="h-12 w-12 mx-auto text-primary" />
          <h1 className="text-2xl font-semibold tracking-tight">Welcome, {user.username}!</h1>
          <p className="text-sm text-muted-foreground">Redirecting you home…</p>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-semibold tracking-tight">Sign-in incomplete</h1>
          <p className="text-sm text-muted-foreground">
            We couldn't confirm your session. Please try again from the sign-in page.
          </p>
          <Button asChild variant="outline">
            <Link to="/auth/login">Back to sign-in</Link>
          </Button>
        </>
      )}
    </div>
  )
}
