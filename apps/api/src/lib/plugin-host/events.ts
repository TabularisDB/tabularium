import type { DomainEvents, EventHandler, HostEvents } from '@tabularium/plugin-host-types'
import { logger } from '$lib/logger'

const log = logger.child({ module: 'plugin-host-events' })

type AnyHandler = (payload: unknown) => void | Promise<void>

export class Bus implements HostEvents {
  private handlers = new Map<keyof DomainEvents, Set<AnyHandler>>()

  on<K extends keyof DomainEvents>(event: K, handler: EventHandler<K>): () => void {
    let set = this.handlers.get(event)
    if (!set) {
      set = new Set()
      this.handlers.set(event, set)
    }
    const wrapped = handler as AnyHandler
    set.add(wrapped)
    return () => {
      set.delete(wrapped)
    }
  }

  emit<K extends keyof DomainEvents>(event: K, payload: DomainEvents[K]): void {
    const set = this.handlers.get(event)
    if (!set || set.size === 0) return
    for (const handler of set) {
      queueMicrotask(async () => {
        try {
          await handler(payload)
        } catch (err) {
          log.warn({ err, event }, 'event handler failed')
        }
      })
    }
  }

  /** Test/reset helper. */
  __clear(): void {
    this.handlers.clear()
  }
}

export const bus = new Bus()
