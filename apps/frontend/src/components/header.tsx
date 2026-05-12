import { Link } from '@tanstack/react-router'
import { Boxes, LogIn } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from './theme-toggle'
import { useAuth } from '@/lib/auth'

export function Header() {
  const { data: user } = useAuth()

  return (
    <header className="border-b border-border sticky top-0 z-40 bg-background/80 backdrop-blur-md">
      <div className="mx-auto max-w-6xl px-6 h-[4.5rem] flex items-center gap-8">
        <Link to="/" className="flex items-center gap-2.5 font-semibold tracking-tight">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Boxes className="h-4 w-4" />
          </span>
          <span>Registry</span>
          <span className="text-muted-foreground font-normal hidden sm:inline">/ Tabularis</span>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <Button asChild variant="ghost" size="sm">
            <Link
              to="/plugins"
              activeProps={{ className: 'text-foreground' }}
              inactiveProps={{ className: 'text-muted-foreground' }}
            >
              Plugins
            </Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link
              to="/requests"
              activeProps={{ className: 'text-foreground' }}
              inactiveProps={{ className: 'text-muted-foreground' }}
            >
              Requests
            </Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link
              to="/submit"
              activeProps={{ className: 'text-foreground' }}
              inactiveProps={{ className: 'text-muted-foreground' }}
            >
              Submit
            </Link>
          </Button>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          {user ? (
            <span className="text-sm">
              <span className="text-muted-foreground">@</span>
              <span className="font-medium">{user.username}</span>
            </span>
          ) : (
            <Button asChild variant="outline" size="sm">
              <Link to="/auth/login">
                <LogIn className="h-3.5 w-3.5" />
                Sign in
              </Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  )
}
