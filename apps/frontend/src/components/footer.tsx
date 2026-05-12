import { ExternalLink } from 'lucide-react'

export function Footer() {
  return (
    <footer className="border-t border-border mt-24">
      <div className="mx-auto max-w-6xl px-6 py-10 grid gap-6 sm:grid-cols-3 text-sm">
        <div className="space-y-2">
          <div className="font-semibold text-foreground">Tabularis Registry</div>
          <p className="text-muted-foreground">
            The plugin index for the Tabularis database client.
          </p>
        </div>
        <div className="space-y-2">
          <div className="font-medium text-foreground">Developers</div>
          <div className="flex flex-col gap-1.5 text-muted-foreground">
            <a href="/openapi" className="hover:text-foreground inline-flex items-center gap-1.5">
              OpenAPI <ExternalLink className="h-3 w-3" />
            </a>
            <a href="/openapi/json" className="hover:text-foreground inline-flex items-center gap-1.5">
              Spec JSON <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
        <div className="space-y-2">
          <div className="font-medium text-foreground">Project</div>
          <div className="flex flex-col gap-1.5 text-muted-foreground">
            <a
              href="https://github.com/TabularisDB"
              target="_blank"
              rel="noreferrer"
              className="hover:text-foreground inline-flex items-center gap-1.5"
            >
              GitHub <ExternalLink className="h-3 w-3" />
            </a>
            <a
              href="https://tabularis.dev"
              target="_blank"
              rel="noreferrer"
              className="hover:text-foreground inline-flex items-center gap-1.5"
            >
              tabularis.dev <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}
