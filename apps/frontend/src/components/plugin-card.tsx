import { Link } from '@tanstack/react-router'
import { ArrowUpRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

type Plugin = {
  id: string
  name: string
  description: string
  latestVersion: string | null
}

export function PluginCard({ plugin, className }: { plugin: Plugin; className?: string }) {
  return (
    <Link
      to="/plugins/$slug"
      params={{ slug: plugin.id }}
      className={cn(
        'group block rounded-lg border border-border bg-card p-5 transition-colors hover:bg-secondary hover:border-border/80',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="font-semibold tracking-tight text-foreground">{plugin.name}</div>
        {plugin.latestVersion && (
          <Badge variant="outline" className="font-mono text-[10px] uppercase tracking-wider">
            v{plugin.latestVersion}
          </Badge>
        )}
      </div>
      <p className="mt-2 text-sm text-muted-foreground line-clamp-2">{plugin.description}</p>
      <div className="mt-4 flex items-center justify-between text-xs">
        <code className="font-mono text-muted-foreground">{plugin.id}</code>
        <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
      </div>
    </Link>
  )
}
