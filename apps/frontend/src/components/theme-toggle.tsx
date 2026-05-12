import { Moon, Sun, Monitor } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTheme } from '@/lib/theme'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  const cycle = () => {
    const order = ['light', 'dark', 'system'] as const
    const next = order[(order.indexOf(theme) + 1) % order.length]
    setTheme(next)
  }

  const Icon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor

  return (
    <Button variant="ghost" size="icon" onClick={cycle} aria-label={`Theme: ${theme}`}>
      <Icon className="h-4 w-4" />
    </Button>
  )
}
