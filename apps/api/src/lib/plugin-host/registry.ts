import type { ExtensionPointDescriptor, HostRegistry } from '@tabularium/plugin-host-types'

interface Contribution {
  name: string
  impl: unknown
}

export class Registry implements HostRegistry {
  private points = new Map<string, ExtensionPointDescriptor>()
  private contributions = new Map<string, Contribution[]>() // point → [{name, impl}, ...]
  private active = new Map<string, string>() // point → active name (single-active only)

  definePoint(point: ExtensionPointDescriptor): void {
    if (this.points.has(point.id)) {
      throw new Error(`extension point already defined: ${point.id}`)
    }
    this.points.set(point.id, point)
    if (!this.contributions.has(point.id)) this.contributions.set(point.id, [])
  }

  register<T>(point: string, name: string, impl: T): void {
    const descriptor = this.points.get(point)
    if (!descriptor) throw new Error(`unknown extension point: ${point}`)
    let bucket = this.contributions.get(point)
    if (!bucket) {
      bucket = []
      this.contributions.set(point, bucket)
    }
    if (bucket.some((c) => c.name === name)) {
      throw new Error(`duplicate contribution ${point}/${name}`)
    }
    bucket.push({ name, impl })
    // First single-active contribution auto-elects as active until setActive overrides.
    if (descriptor.arity === 'single-active' && !this.active.has(point)) {
      this.active.set(point, name)
    }
  }

  resolve<T>(point: string): T | null {
    const descriptor = this.points.get(point)
    if (!descriptor) return null
    const bucket = this.contributions.get(point) ?? []
    if (descriptor.arity === 'single-active') {
      const activeName = this.active.get(point)
      if (!activeName) return null
      const hit = bucket.find((c) => c.name === activeName)
      return (hit?.impl ?? null) as T | null
    }
    return (bucket[0]?.impl ?? null) as T | null
  }

  resolveAll<T>(point: string): Array<{ name: string; impl: T }> {
    const bucket = this.contributions.get(point) ?? []
    return bucket.map((c) => ({ name: c.name, impl: c.impl as T }))
  }

  setActive(point: string, name: string): void {
    const descriptor = this.points.get(point)
    if (!descriptor) throw new Error(`unknown extension point: ${point}`)
    if (descriptor.arity !== 'single-active') {
      throw new Error(`setActive is only valid for single-active points: ${point}`)
    }
    const bucket = this.contributions.get(point) ?? []
    if (!bucket.some((c) => c.name === name)) {
      throw new Error(`unknown contribution ${point}/${name}`)
    }
    this.active.set(point, name)
  }

  getActive(point: string): string | null {
    return this.active.get(point) ?? null
  }

  /** Test/reset helper. */
  __clear(): void {
    this.points.clear()
    this.contributions.clear()
    this.active.clear()
  }
}

export const registry = new Registry()
