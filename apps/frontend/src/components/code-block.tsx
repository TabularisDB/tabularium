import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function CodeBlock({ children }: { children: string }) {
  const [copied, setCopied] = useState(false)

  const copy = () => {
    navigator.clipboard.writeText(children)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="relative group">
      <pre className="rounded-lg border border-border bg-card px-4 py-3 text-sm overflow-x-auto font-mono text-foreground/90">
        <code>{children}</code>
      </pre>
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-1.5 right-1.5 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={copy}
        aria-label="Copy"
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </Button>
    </div>
  )
}
