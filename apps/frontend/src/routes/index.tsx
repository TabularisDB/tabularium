import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: () => (
    <div className="mx-auto max-w-6xl px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Tabularis Plugin Registry</h1>
      <p className="text-muted-foreground mt-2">Home page placeholder — Task 6 will flesh this out.</p>
    </div>
  ),
})
