export type ServerMode = 'setup' | 'normal'

let mode: ServerMode = 'setup'

export function setServerMode(next: ServerMode): void {
  mode = next
}

export function getServerMode(): ServerMode {
  return mode
}
